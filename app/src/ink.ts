// The free drawing layer that sits on top of the page.
//
// The main thing is that the stroke feels fluid, like a pen on a tablet:
// - The stroke responds to pen pressure and, with a mouse, simulates it from
//   the speed (perfect-freehand).
// - No smoothing by default: the line follows the hand exactly. The smoothing
//   (stabilizer) is optional.
// - Three canvases: finished strokes that go behind the text, the ones that go
//   on top, and one for the stroke in progress. Each stroke remembers which
//   layer it was drawn on: changing the option only affects what is drawn next.
// - While drawing, the stroke in progress is painted on its own layer (which
//   every frame puts back the way it was at the start): the color you see while
//   drawing is the same one that stays when you lift the pen, even when painted
//   over another color. The top canvas only receives the pen and shows the
//   eraser and the guides.
// - The stroke is painted as a union of circles and the segments that join
//   them: even if the hand zigzags, a thick transparent stroke shows no gaps or
//   spikes, and the transparency is even along the whole stroke.
// - Low latency: raw pen events when the system offers them, and prediction of
//   the next point.
// - Blend: watercolor multiplies with what is underneath (like transparent
//   pigments); blur and smudge work on what is already painted, with soft
//   touches along the stroke. Everything comes from the saved points, so it
//   looks the same when reopened, exported and printed.
//
// The canvases live inside the page (the back layer, between the paper and the
// letters) and cover what is visible plus a margin above and below, not the whole document, so long documents don't waste memory.
// When scrolling, the drawing moves together with the text, without waiting to
// be repainted; only when nearing the edge of the margin are they placed again.
// Strokes are saved as points relative to the page.
//
// There is a single pen. Its thickness is measured on the screen: at high zoom
// the stroke is thin on the page, so tiny details can be drawn. Its
// transparency is chosen separately.
//
// The eraser works like in Paint: it erases exactly where it passes, no matter
// the zoom or how big the drawing is. Each pass is saved as one more stroke,
// which when painted removes what was drawn before in that place (on both
// layers). So erasing costs the same as drawing a line, and undoing is removing
// that pass. It has its own size and its own strength: at half strength, it
// lightens instead of removing completely.

import { getStrokePoints } from "perfect-freehand";
import { t } from "./i18n";

export type Point = [x: number, y: number, pressure: number];

export interface Stroke {
  /** Name of a palette color (`ink`, `agua`…) or a fixed color `#rrggbb`. */
  color: string;
  /** Base diameter of the stroke. */
  size: number;
  points: Point[];
  /** Smoothing: 0 follows the hand as is; up to 1 stabilizes the line. */
  streamline: number;
  /** Drawn without real pressure (mouse or finger): it is simulated from the speed. */
  simulatePressure: boolean;
  /** From almost transparent to 1 (solid). */
  opacity: number;
  /** An eraser pass: `size` is its diameter and it erases what was drawn before. */
  erase: boolean;
  /** A shape (line, arrow, rectangle, ellipse) between the first point and the last. */
  shape?: Shape;
  /** Drawn on top of the text; otherwise it goes behind. */
  front?: boolean;
  /** A blend effect instead of a plain stroke. */
  effect?: Effect;
  /** A rectangle's or ellipse's fill (a color like `color`). None: not filled. */
  fill?: string;
  /** `false`: a filled shape without its outline. */
  outline?: false;
}

/** Shapes that close an area: they can be filled. */
export const FILLABLE: readonly Shape[] = ["rect", "ellipse"];

/** What changed in the drawing, to undo it and redo it. */
type Change =
  | { type: "add"; stroke: Stroke; index: number }
  | { type: "edit"; before: Stroke; after: Stroke }
  | { type: "remove"; stroke: Stroke; index: number };

/** What the person is dragging on a selected shape: all of it, or one of its handles. */
export type Grab = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "start" | "end";

export const SHAPES = ["line", "arrow", "rect", "ellipse"] as const;
export type Shape = (typeof SHAPES)[number];

/** The ways to blend colors:
 *  - `watercolor`: the color multiplies with what is underneath, with soft
 *    edges; yellow over light blue gives green.
 *  - `blur`: melts what is painted where it passes.
 *  - `smudge`: carries the color in the direction of the stroke, like with a finger. */
export const EFFECTS = ["watercolor", "blur", "smudge"] as const;
export type Effect = (typeof EFFECTS)[number];

/** Blur and smudge paint no color of their own: they work on what is already painted. */
export function worksOnPaint(stroke: Pick<Stroke, "effect">): boolean {
  return stroke.effect === "blur" || stroke.effect === "smudge";
}

/** Does the stroke leave paint (it is not the eraser or an effect on what is painted)? */
function paints(stroke: Stroke): boolean {
  return !stroke.erase && !worksOnPaint(stroke);
}

export type InkTool = "pen" | "eraser";


export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The eraser is never smaller than this on the screen, so it is easy to use. */
const MIN_ERASER_RADIUS = 6;
/** The lowest pen transparency: something always shows. */
export const MIN_OPACITY = 0.05;
/** How much the smoothing corrects when it is on. */
export const STREAMLINE_ON = 0.5;
/** The handles of a selected shape: their size and how close a click must be, on the screen. */
const HANDLE_SIZE = 9;
const HANDLE_REACH = 9;

/** Within how many screen pixels a shape snaps to a guide. */
const SNAP_DISTANCE = 8;
/** The minimum distance between two points of a stroke, in screen pixels. */
const MIN_STEP = 0.75;
/** How much more than the visible area the canvases cover, above and below (in screen heights). */
const OVERSCAN = 0.35;
/** The canvases' size grows and shrinks by steps of this many screen pixels. */
const SIZE_STEP = 128;
/** The canvases are placed again before the visible area gets closer than this to their edge. */
const EDGE = 96;

/** A guide shown while a shape is snapped to it: a vertical (`x`) or
 *  horizontal (`y`) line on the page. */
export interface Guide {
  axis: "x" | "y";
  at: number;
}

export class Ink {
  tool: InkTool = "pen";
  color = "ink";
  /** Thickness on the screen, in pixels: the same at any zoom. */
  size = 6;
  /** Pen transparency, from `MIN_OPACITY` to 1. */
  opacity = 1;
  /** With a shape chosen, the pen draws that shape instead of a freehand stroke. */
  shape: Shape | null = null;
  /** Shapes have their own outline thickness (on the screen) and transparency,
   *  apart from the pen's, and can be filled. */
  shapeSize = 4;
  shapeOpacity = 1;
  shapeFill: string | null = null;
  shapeOutline = true;
  /** Called when a shape is selected (after drawing it, or with a click) or let go. */
  onSelect: (shape: Stroke | null) => void = () => {};
  streamline = 0;
  /** New strokes are drawn on top of the text (what is already drawn stays where it was). */
  front = false;
  /** The eraser has its own size (on the screen) and strength. */
  eraserSize = 24;
  eraserOpacity = 1;
  /** Center guides: shapes snap to the center of the page, for symmetric work. */
  snap = false;
  /** The height of each page, to know where its center is. */
  sheetHeight = 1056;
  /** Blend: with an effect chosen, the pen blends instead of painting. */
  effect: Effect | null = null;
  /** The size (on the screen) and strength of the blend, separate from the pen's. */
  effectSize = 32;
  effectStrength = 0.6;

  private scale = 1;
  /** Another way to choose the colors, only while exporting (for example, for paper). */
  private colorFor: ((color: string) => string) | null = null;
  private strokes: Stroke[] = [];
  /** What can be undone: each stroke or eraser pass added, each shape changed or removed. */
  private history: Change[] = [];
  /** What was undone, to redo it in the same place among the other strokes. */
  private undone: Change[] = [];
  /** The shape selected to move it, resize it or change it, like an object. */
  private selected: Stroke | null = null;
  /** While a selected shape is dragged: what is held, where it started and the shape as it was. */
  private grab: { kind: Grab; from: Point; original: Stroke } | null = null;
  private bounds = new WeakMap<Stroke, Bounds>();
  /** What is already computed for each effect (see `paintFinished`). */
  private baked = new WeakMap<Stroke, Baked>();
  private paths = new WeakMap<Stroke, Outline>();
  /** The documents shown before in this pane, with their strokes as they were
   *  painted: going back to one reuses its outlines and its computed effects
   *  instead of computing them all again. Newest last. */
  private recent = new Map<string, Stroke[]>();
  /** Which document the strokes belong to (its id), if any. */
  private key: string | null = null;
  /** While repainting: effects not computed yet wait for the next frame once
   *  this moment passes, so opening a document never freezes the window. */
  private bakeDeadline = Infinity;
  private bakeDeferred = false;
  private layerWaiting = false;
  private zoomSettles = 0;
  /** Whether each layer had something painted the last time (see `paintBase`). */
  private layerInked = [true, true];
  /** Whether the live canvas has something on it (guides, selection, eraser). */
  private liveDirty = true;
  private zoomTimer = 0;
  /** Some blend on screen could look sharper (after zooming in). */
  private blurry = false;
  private sharpenHandle = 0;
  /** The part of the page on screen, in page units (to sharpen only what is seen). */
  private visible = { top: 0, bottom: 0 };
  private current: Stroke | null = null;
  private predicted: Point[] = [];
  /** The guides the shape in progress is snapped to. */
  private guides: Guide[] = [];
  private eraseFrame = 0;
  /** The pen (or finger, or mouse) that is drawing. */
  private pointerId: number | null = null;
  /** How the two layers were when the eraser pass started: every frame starts
   *  from there and removes the whole pass, so the strength is even. */
  private snapshots: HTMLCanvasElement[] = [];
  /** Where the eraser is, to draw its circle. */
  private eraserAt: { x: number; y: number } | null = null;
  /** The two layers of finished strokes: [behind the text, on top]. */
  private layers: [CanvasRenderingContext2D, CanvasRenderingContext2D];
  private liveCtx: CanvasRenderingContext2D;
  /** The layer where the stroke in progress is painted. */
  private liveLayer: 0 | 1 | null = null;
  /** Blur and smudge are applied touch by touch: how many were already applied live. */
  private dabsDone = 0;
  private liveReset = true;
  /** The pen stroke in progress, computed piece by piece (see `paintPen`). */
  private liveBrush: LiveBrush | null = null;
  /** The part of the page the stroke in progress changed in the last frame. */
  private touched: Rect | null = null;
  /** How many points of the eraser pass are already on the mask. */
  private erased = 0;
  /** Where the canvases are inside the page, in screen pixels. */
  private placed = { left: 0, top: 0, width: 0, height: 0, dpr: 0, scale: 0 };
  private baseFrame = 0;
  private liveFrame = 0;
  private observers: ResizeObserver[] = [];

  constructor(
    private bases: [behind: HTMLCanvasElement, front: HTMLCanvasElement],
    private live: HTMLCanvasElement,
    private page: HTMLElement,
    private scroller: HTMLElement,
    /** Turns the color saved in a stroke into the real color of the current sky. */
    private resolveColor: (color: string) => string,
    private onChange: () => void,
  ) {
    const behindCtx = bases[0].getContext("2d");
    const frontCtx = bases[1].getContext("2d");
    // `desynchronized` lets the browser show the eraser and the guides without
    // waiting for the rest of the screen.
    const liveCtx = live.getContext("2d", { desynchronized: true });
    if (!behindCtx || !frontCtx || !liveCtx) throw new Error(t("ink.canvasUnavailable"));
    this.layers = [behindCtx, frontCtx];
    this.liveCtx = liveCtx;

    live.addEventListener("pointerdown", (e) => this.pointerDown(e));
    // The canvas is inside the page: a click on it does not select or drag
    // text (the browser would cancel the stroke).
    live.addEventListener("mousedown", (e) => e.preventDefault());
    live.addEventListener("dragstart", (e) => e.preventDefault());
    // `pointerrawupdate` delivers pen movements as soon as they happen, without
    // waiting for the next frame. If the system does not offer it, `pointermove` is used.
    const moveEvent = "onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove";
    live.addEventListener(moveEvent, (e) => this.pointerMove(e as PointerEvent));
    live.addEventListener("pointerup", (e) => this.pointerUp(e));
    live.addEventListener("pointercancel", (e) => this.pointerUp(e));
    live.addEventListener("pointerleave", () => {
      this.eraserAt = null;
      this.requestLive();
    });

    // When scrolling, the canvases move with the page; they are only repainted
    // if the visible area nears the edge of what they cover.
    scroller.addEventListener("scroll", () => {
      // While zooming (the view moves to keep the pointer in place), the
      // repaint waits for the zoom to stop.
      if (this.zoomTimer) return;
      if (this.place(false)) this.paintNow();
    }, { passive: true });
    // On resize (opening the sidebar, splitting), it repaints in the same
    // frame: the drawing never disappears, not even for an instant.
    this.observers = [new ResizeObserver(() => this.resize()), new ResizeObserver(() => this.redraw())];
    this.observers[0].observe(scroller);
    this.observers[0].observe(this.stage);
    this.observers[1].observe(page);
    this.resize();
  }

  /** Measures and paints the canvases again (for example, after printing,
   *  when the browser left them at zero). */
  refresh(): void {
    this.resize();
  }

  /** Releases the observers when the pane closes. */
  dispose(): void {
    for (const observer of this.observers) observer.disconnect();
    const cancelIdle = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (cancelIdle) cancelIdle(this.sharpenHandle);
    else clearTimeout(this.sharpenHandle);
    cancelAnimationFrame(this.baseFrame);
    cancelAnimationFrame(this.liveFrame);
    cancelAnimationFrame(this.eraseFrame);
  }

  /** The page zoom. Strokes are always saved at real size. */
  get zoom(): number {
    return this.scale;
  }

  set zoom(value: number) {
    this.scale = value;
    // While zooming, effects are not computed again (each step would cost a
    // lot); a moment after it stops they are, if they can look sharper.
    this.zoomSettles = performance.now() + ZOOM_SETTLE_MS;
    // The canvases are inside the page: while zooming they grow and shrink
    // with it as images, for free. They are repainted (sharp, and covering
    // the new view) once the zoom stops for a moment.
    clearTimeout(this.zoomTimer);
    this.zoomTimer = window.setTimeout(() => {
      this.zoomTimer = 0;
      this.redraw();
    }, ZOOM_REPAINT_MS);
  }

  set enabled(on: boolean) {
    this.live.classList.toggle("drawing", on);
    if (!on) this.eraserAt = null;
  }

  /** The area inside the page that the canvases cover. */
  private get stage(): HTMLElement {
    return this.live.parentElement ?? this.scroller;
  }

  getStrokes(): Stroke[] {
    return this.strokes;
  }

  /** Shows a document's strokes. With `key` (the document's id), going back to
   *  it later reuses what was already computed for it. */
  setStrokes(strokes: Stroke[], key?: string): void {
    this.remember();
    const cached = key ? this.recent.get(key) : undefined;
    if (key) this.recent.delete(key);
    this.key = key ?? null;
    this.strokes = cached && sameStrokes(cached, strokes) ? cached : strokes.map(normalize);
    this.grab = null;
    this.select(null);
    this.history = [];
    this.undone = [];
    for (const stroke of this.strokes) this.bounds.set(stroke, computeBounds(stroke));
    this.redraw();
  }

  /** Keeps the strokes of the document being left, within a memory budget. */
  private remember(): void {
    if (!this.key || !this.strokes.length) return;
    this.recent.set(this.key, this.strokes);
    let pixels = 0;
    for (const [key, strokes] of [...this.recent].reverse()) {
      for (const stroke of strokes) {
        const baked = this.baked.get(stroke);
        if (baked) pixels += baked.canvas.width * baked.canvas.height;
      }
      if (pixels > RECENT_PIXELS || this.recent.size > RECENT_DOCUMENTS) this.recent.delete(key);
    }
  }

  /** Lowest drawn point, so the page grows and there is always room below. */
  lowestPoint(): number {
    let lowest = 0;
    for (const stroke of this.strokes) {
      if (paints(stroke)) lowest = Math.max(lowest, this.bounds.get(stroke)?.maxY ?? 0);
    }
    return lowest;
  }

  // ---------- Pages ----------
  // When a page is added, removed or duplicated, the drawing moves with it.
  // Each stroke belongs to the page where its center is.

  private middle(stroke: Stroke): number {
    const b = this.bounds.get(stroke) ?? computeBounds(stroke);
    return (b.minY + b.maxY) / 2;
  }

  private replaceStrokes(strokes: Stroke[]): void {
    this.strokes = strokes;
    this.select(null);
    // What was under each blend may have moved: it is computed again.
    this.baked = new WeakMap();
    // Undoing across a page change would leave strokes out of place.
    this.history = [];
    this.undone = [];
    for (const stroke of strokes) if (!this.bounds.has(stroke)) this.bounds.set(stroke, computeBounds(stroke));
    this.redraw();
  }

  /** Moves what is drawn from `from` down by `dy` (or up, if negative). */
  shiftFrom(from: number, dy: number): void {
    this.replaceStrokes(this.strokes.map((s) => (this.middle(s) >= from ? moved(s, dy) : s)));
  }

  /** Removes what is drawn between `top` and `bottom`. */
  removeBand(top: number, bottom: number): void {
    this.replaceStrokes(this.strokes.filter((s) => this.middle(s) < top || this.middle(s) >= bottom));
  }

  /** Does any stroke cross the band between `top` and `bottom` (to print page by page)? */
  touches(top: number, bottom: number): boolean {
    return this.strokes.some((s) => {
      const b = this.bounds.get(s);
      return paints(s) && b !== undefined && b.maxY + s.size >= top && b.minY - s.size <= bottom;
    });
  }

  /** Is anything drawn between `top` and `bottom`? */
  hasStrokesIn(top: number, bottom: number): boolean {
    return this.strokes.some((s) => paints(s) && this.middle(s) >= top && this.middle(s) < bottom);
  }

  /** Copies what is drawn between `top` and `bottom`, `dy` further down. */
  copyBand(top: number, bottom: number, dy: number): void {
    const copies = this.strokes.filter((s) => this.middle(s) >= top && this.middle(s) < bottom).map((s) => moved(s, dy));
    this.replaceStrokes([...this.strokes, ...copies]);
  }

  /** Called with each new change to the drawing (not when undoing or redoing). */
  onRecord: () => void = () => {};

  /** What was undone can no longer be redone (something else changed). */
  forgetRedo(): void {
    this.undone = [];
  }

  undo(): void {
    const change = this.history.pop();
    if (!change) return;
    if (change.type === "add") {
      const index = this.strokes.indexOf(change.stroke);
      if (index < 0) return;
      this.strokes.splice(index, 1);
      this.undone.push({ ...change, index });
      this.afterShapeChange({ ...change, index });
      return;
    } else if (change.type === "edit") {
      this.swap(change.after, change.before);
      this.undone.push(change);
      this.afterShapeChange({ type: "edit", before: change.after, after: change.before });
      return;
    } else {
      this.strokes.splice(Math.min(change.index, this.strokes.length), 0, change.stroke);
      this.undone.push(change);
    }
    this.afterShapeChange(change);
  }

  /** Puts back the last thing undone, in the same place among the strokes. */
  redo(): void {
    const change = this.undone.pop();
    if (!change) return;
    if (change.type === "add") {
      this.strokes.splice(Math.min(change.index, this.strokes.length), 0, change.stroke);
    } else if (change.type === "edit") {
      this.swap(change.before, change.after);
    } else {
      const index = this.strokes.indexOf(change.stroke);
      if (index >= 0) this.strokes.splice(index, 1);
    }
    this.history.push(change);
    this.afterShapeChange(change);
  }

  /** Puts one version of a stroke in the place of the other. */
  private swap(from: Stroke, to: Stroke): void {
    const index = this.strokes.indexOf(from);
    if (index < 0) return;
    this.strokes[index] = to;
    if (!this.bounds.has(to)) this.bounds.set(to, computeBounds(to));
    if (this.selected === from) this.selected = to;
  }

  /** After a change: the blends drawn over what changed are computed again
   *  (only those, and the ones over them); the selection stays only if its
   *  shape is still there. */
  private afterShapeChange(change?: Change): void {
    if (this.selected && !this.strokes.includes(this.selected)) this.select(null);
    if (change) {
      const touched = change.type === "edit" ? [change.before, change.after] : [change.stroke];
      const index = change.type === "edit" ? this.strokes.indexOf(change.after) : change.index;
      this.invalidateAbove(Math.max(0, index), touched);
    }
    this.redraw();
    this.onChange();
  }

  /** Forgets the computed blur and smudge above `index` that lie over the
   *  changed strokes (and, in turn, the ones over those). */
  private invalidateAbove(index: number, changed: Stroke[]): void {
    const areas = changed.map((s) => ({ bounds: this.bounds.get(s) ?? computeBounds(s), margin: s.size, front: Boolean(s.front), erase: s.erase }));
    for (let i = index; i < this.strokes.length; i++) {
      const stroke = this.strokes[i];
      if (!stroke.effect || stroke.effect === "watercolor" || !this.baked.has(stroke)) continue;
      const b = this.bounds.get(stroke) ?? computeBounds(stroke);
      const hit = areas.some((a) => (a.erase || a.front === Boolean(stroke.front)) && overlaps(a.bounds, a.margin, b, stroke.size * 1.3 + 2));
      if (!hit) continue;
      this.baked.delete(stroke);
      areas.push({ bounds: b, margin: stroke.size * 1.3 + 2, front: Boolean(stroke.front), erase: false });
    }
  }

  // ---------- Shapes as objects ----------

  /** The selected shape, if any. */
  get selectedShape(): Stroke | null {
    return this.selected;
  }

  select(shape: Stroke | null): void {
    if (this.selected === shape) return;
    this.selected = shape;
    this.requestLive();
    this.onSelect(shape);
  }

  /** Changes the selected shape (its color, outline, fill or transparency). */
  updateSelected(changes: Partial<Pick<Stroke, "color" | "size" | "opacity" | "fill" | "outline">>): void {
    const before = this.selected;
    if (!before) return;
    const after: Stroke = { ...before, ...changes };
    if (!after.fill || !FILLABLE.includes(after.shape!)) {
      delete after.fill;
      delete after.outline;
    }
    if (after.outline !== false) delete after.outline;
    this.replaceShape(before, after);
  }

  /** Removes the selected shape (it can be undone). */
  deleteSelected(): void {
    const shape = this.selected;
    if (!shape) return;
    const index = this.strokes.indexOf(shape);
    if (index < 0) return;
    this.strokes.splice(index, 1);
    this.history.push({ type: "remove", stroke: shape, index });
    this.undone = [];
    this.onRecord();
    this.select(null);
    this.afterShapeChange({ type: "remove", stroke: shape, index });
  }

  private replaceShape(before: Stroke, after: Stroke): void {
    this.bounds.set(after, computeBounds(after));
    this.swap(before, after);
    this.history.push({ type: "edit", before, after });
    this.undone = [];
    this.onRecord();
    this.afterShapeChange({ type: "edit", before, after });
  }

  /** The handles of a shape, in page units: corners and sides of its box, or the two ends of a line. */
  private handles(shape: Stroke): Array<{ kind: Grab; x: number; y: number }> {
    const [a, b] = [shape.points[0], shape.points[shape.points.length - 1]];
    if (!FILLABLE.includes(shape.shape!)) {
      return [
        { kind: "start", x: a[0], y: a[1] },
        { kind: "end", x: b[0], y: b[1] },
      ];
    }
    const [l, r, t, bt] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const [cx, cy] = [(l + r) / 2, (t + bt) / 2];
    return [
      { kind: "nw", x: l, y: t },
      { kind: "n", x: cx, y: t },
      { kind: "ne", x: r, y: t },
      { kind: "e", x: r, y: cy },
      { kind: "se", x: r, y: bt },
      { kind: "s", x: cx, y: bt },
      { kind: "sw", x: l, y: bt },
      { kind: "w", x: l, y: cy },
    ];
  }

  /** What is under the pointer: a handle of the selected shape, the inside of it, or another shape. */
  private shapeAt(point: Point): { shape: Stroke; kind: Grab } | null {
    const reach = HANDLE_REACH / this.scale;
    if (this.selected) {
      for (const handle of this.handles(this.selected)) {
        if (Math.hypot(point[0] - handle.x, point[1] - handle.y) <= reach) return { shape: this.selected, kind: handle.kind };
      }
      if (hitsShape(this.selected, point, reach, true)) return { shape: this.selected, kind: "move" };
    }
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i];
      if (stroke.shape && !stroke.erase && hitsShape(stroke, point, reach, false)) return { shape: stroke, kind: "move" };
    }
    return null;
  }

  /** The shape as it is being dragged: moved, or with one side or end pulled. */
  private dragged(original: Stroke, kind: Grab, from: Point, to: Point, even: boolean): Stroke {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const [a, b] = [original.points[0], original.points[original.points.length - 1]];
    let points: [Point, Point];
    if (kind === "move") {
      points = [
        [a[0] + dx, a[1] + dy, a[2]],
        [b[0] + dx, b[1] + dy, b[2]],
      ];
    } else if (kind === "start" || kind === "end") {
      const fixed = kind === "start" ? b : a;
      const moving = constrain(fixed, [to[0], to[1], 0.5], even, original.shape!);
      points = kind === "start" ? [moving, b] : [a, moving];
    } else {
      let [l, r, t, bt] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      if (kind.includes("w")) l += dx;
      if (kind.includes("e")) r += dx;
      if (kind.includes("n")) t += dy;
      if (kind.includes("s")) bt += dy;
      points = [
        [Math.min(l, r), Math.min(t, bt), 0.5],
        [Math.max(l, r), Math.max(t, bt), 0.5],
      ];
    }
    // With the guides on, a shape that is moved or resized also snaps to the
    // middle of the page: to place it centered or to make it symmetric.
    this.guides = [];
    if (this.snap) {
      const center = this.centers([0, (points[0][1] + points[1][1]) / 2, 0.5]);
      const snapped = snapDrag(points, kind, original.shape!, center, SNAP_DISTANCE / this.scale);
      points = snapped.points;
      this.guides = snapped.guides;
    }
    return { ...original, points: points.map(([x, y, p]) => [round(x), round(y), p] as Point) };
  }

  private cursorFor(kind: Grab | null): string {
    switch (kind) {
      case "move":
        return "move";
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      case "nw":
      case "se":
        return "nwse-resize";
      case "start":
      case "end":
        return "grab";
      default:
        return "";
    }
  }

  /** The selected shape's box and handles, on the live canvas. */
  private paintSelection(ctx: CanvasRenderingContext2D): void {
    const shape = this.selected;
    if (!shape || !this.strokes.includes(shape)) return;
    this.liveDirty = true;
    const unit = 1 / this.scale;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const accent = getComputedStyle(this.page).getPropertyValue("--accent").trim() || "#246fa3";
    if (FILLABLE.includes(shape.shape!)) {
      const b = computeBounds(shape);
      const pad = shape.size / 2 + 3 * unit;
      ctx.lineWidth = unit;
      ctx.setLineDash([4 * unit, 3 * unit]);
      ctx.strokeStyle = accent;
      ctx.strokeRect(b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad);
      ctx.setLineDash([]);
    }
    const half = (HANDLE_SIZE / 2) * unit;
    for (const handle of this.handles(shape)) {
      ctx.beginPath();
      ctx.rect(handle.x - half, handle.y - half, 2 * half, 2 * half);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5 * unit;
      ctx.strokeStyle = accent;
      ctx.stroke();
    }
    ctx.restore();
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** The area the drawing takes on the page (without eraser passes), or null if there is nothing. */
  drawingBounds(): Bounds | null {
    let result: Bounds | null = null;
    for (const stroke of this.strokes) {
      const b = this.bounds.get(stroke);
      if (!b || !paints(stroke)) continue;
      const m = stroke.size;
      result = result
        ? { minX: Math.min(result.minX, b.minX - m), minY: Math.min(result.minY, b.minY - m), maxX: Math.max(result.maxX, b.maxX + m), maxY: Math.max(result.maxY, b.maxY + m) }
        : { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
    }
    return result;
  }

  /** Paints the whole drawing on another canvas (to export or print): the point
   *  (x, y) of the page goes to the corner, and each page unit measures `scale` pixels. */
  renderTo(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, resolve?: (color: string) => string, front?: boolean): void {
    if (front === undefined) {
      // The two layers, each on its own (the eraser of one does not touch the
      // other twice), and the top one over the one behind.
      for (const layer of [false, true]) {
        const canvas = document.createElement("canvas");
        canvas.width = ctx.canvas.width;
        canvas.height = ctx.canvas.height;
        const layerCtx = canvas.getContext("2d");
        if (!layerCtx) continue;
        this.renderTo(layerCtx, x, y, scale, resolve, layer);
        ctx.drawImage(canvas, 0, 0);
      }
      return;
    }
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
    this.colorFor = resolve ?? null;
    try {
      for (const stroke of this.strokes) if (stroke.erase || Boolean(stroke.front) === front) this.fillStroke(ctx, stroke);
    } finally {
      this.colorFor = null;
      ctx.restore();
    }
  }

  /** The drawing's color at a point of the screen (front layer over the one
   *  behind), or null where nothing is drawn. For the eyedropper. */
  colorAt(clientX: number, clientY: number): string | null {
    const rect = this.live.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = Math.floor((clientX - rect.left) * dpr);
    const y = Math.floor((clientY - rect.top) * dpr);
    let color: [number, number, number] | null = null;
    let alpha = 0;
    for (const ctx of [this.layers[1], this.layers[0]]) {
      if (x < 0 || y < 0 || x >= ctx.canvas.width || y >= ctx.canvas.height) continue;
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if (a < 8) continue;
      // The first opaque enough pixel wins; a faint one is mixed with what is under it.
      const weight = (a / 255) * (1 - alpha);
      color = color ? [color[0] + r * weight, color[1] + g * weight, color[2] + b * weight] : [r * weight, g * weight, b * weight];
      alpha += weight;
      if (alpha > 0.98) break;
    }
    if (!color || alpha < 0.05) return null;
    const hex = (n: number) => Math.round(Math.min(255, n / alpha)).toString(16).padStart(2, "0");
    return `#${hex(color[0])}${hex(color[1])}${hex(color[2])}`;
  }

  /** Is anything drawn on top of the text? */
  hasFront(): boolean {
    return this.strokes.some((s) => s.front && paints(s));
  }

  /** Changing the sky changes the colors: the saved blends are computed again. */
  recolor(): void {
    this.baked = new WeakMap();
    this.redraw();
  }

  /** Paints everything again. */
  redraw(): void {
    if (this.baseFrame) return;
    this.baseFrame = requestAnimationFrame(() => {
      this.baseFrame = 0;
      this.place(true);
      this.paintBase();
      this.paintLive();
    });
  }

  /** Repaints now, in this same frame. */
  private paintNow(): void {
    cancelAnimationFrame(this.baseFrame);
    this.baseFrame = 0;
    this.paintBase();
    this.paintLive();
  }

  // ---------- Input ----------

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Right after zooming, the canvases are repainted at the new size first.
    if (this.zoomTimer) {
      clearTimeout(this.zoomTimer);
      this.zoomTimer = 0;
      this.place(true);
      this.paintNow();
    }
    // A second finger (or the palm) while drawing does not take over the stroke.
    if (this.current) return;
    let point = this.toPage(e);
    // Drawing does not start outside the page.
    if (!this.onPage(point)) return;
    this.live.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId;
    if (this.tool === "eraser") {
      this.current = {
        color: "ink",
        size: roundSize(this.eraserRadius() * 2),
        points: [point],
        streamline: 0,
        simulatePressure: false,
        opacity: clampOpacity(this.eraserOpacity),
        erase: true,
      };
      this.takeSnapshots();
      this.erased = 0;
      this.requestErase();
      return;
    }
    this.guides = [];
    // With a shape chosen, a click on a shape takes it like an object: to move
    // it, to pull a handle, or to change it from the panel. Elsewhere, it is let go
    // and a new shape is drawn.
    if (this.shape && !this.effect) {
      const hit = this.shapeAt(point);
      if (hit) {
        this.select(hit.shape);
        this.grab = { kind: hit.kind, from: point, original: hit.shape };
        return;
      }
      this.select(null);
    }
    if (this.shape && this.snap) {
      // The shape can also start right on a guide.
      const snapped = snapPoint(point, this.centers(point), SNAP_DISTANCE / this.scale);
      point = snapped.point;
      this.guides = snapped.guides;
    }
    this.current = {
      color: this.color,
      // The chosen thickness is on the screen: on the page it depends on the zoom.
      size: roundSize(this.size / this.scale),
      points: [point],
      streamline: this.streamline,
      simulatePressure: e.pointerType !== "pen",
      opacity: clampOpacity(this.opacity),
      erase: false,
    };
    if (this.front) this.current.front = true;
    if (this.effect) {
      // Blend uses its own size and strength; watercolor uses the pen color.
      this.current.effect = this.effect;
      this.current.size = roundSize(this.effectSize / this.scale);
      this.current.opacity = clampOpacity(this.effectStrength);
      if (worksOnPaint(this.current)) this.current.simulatePressure = false;
    } else if (this.shape) {
      // A shape goes from the point where the pen touched down to where it is now,
      // with its own thickness and transparency; a rectangle or an ellipse may be filled.
      this.current.shape = this.shape;
      this.current.simulatePressure = false;
      this.current.points = [point, point];
      this.current.size = roundSize(this.shapeSize / this.scale);
      this.current.opacity = clampOpacity(this.shapeOpacity);
      if (this.shapeFill && FILLABLE.includes(this.shape)) {
        this.current.fill = this.shapeFill;
        if (!this.shapeOutline) this.current.outline = false;
      }
    }
    this.predicted = [];
    this.beginLive();
    this.requestLive();
  }

  /** While drawing, the stroke is painted on its layer: every frame starts from
   *  how the layer was at the start. What you see is what will stay. */
  private beginLive(): void {
    this.liveLayer = this.current?.front ? 1 : 0;
    // The stroke is painted on the layer directly: the next repaint has to clear it.
    this.layerInked[this.liveLayer] = true;
    this.takeSnapshots();
    this.liveReset = true;
  }

  private endLive(): void {
    this.liveLayer = null;
    this.liveBrush = null;
    this.clearLive();
  }

  private pointerMove(e: PointerEvent): void {
    if (this.tool === "eraser") {
      const rect = this.live.getBoundingClientRect();
      this.eraserAt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.requestLive();
    }
    if (this.shape && !this.effect && this.tool === "pen" && !this.current) {
      if (this.grab && e.pointerId === this.pointerId) {
        const to = this.toPage(e);
        const shape = this.dragged(this.grab.original, this.grab.kind, this.grab.from, to, e.shiftKey);
        const index = this.strokes.indexOf(this.selected!);
        if (index >= 0) {
          this.bounds.set(shape, computeBounds(shape));
          this.strokes[index] = shape;
          this.selected = shape;
          this.redraw();
        }
      } else {
        // The pointer says what a click would do.
        this.live.style.cursor = this.cursorFor(this.shapeAt(this.toPage(e))?.kind ?? null);
      }
      return;
    }
    if (!this.live.hasPointerCapture(e.pointerId) || e.pointerId !== this.pointerId) return;
    // Coalesced events recover the in-between points: curves true to the hand.
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    if (this.current?.shape) {
      // With Shift, the shape stays even: square, circle or 45° line.
      const start = this.current.points[0];
      let end = constrain(start, this.toPage(e), e.shiftKey, this.current.shape);
      this.guides = [];
      if (this.snap) {
        const snapped = snapShape(start, end, this.current.shape, this.centers(start), SNAP_DISTANCE / this.scale);
        end = snapped.point;
        this.guides = snapped.guides;
      }
      this.current.points[1] = end;
      this.requestLive();
      return;
    }
    for (const event of events.length ? events : [e]) this.addPoint(this.toPage(event));
    if (this.current?.erase) {
      this.requestErase();
    } else if (this.current && worksOnPaint(this.current)) {
      this.requestLive();
    } else if (this.current) {
      // The prediction draws a little ahead of the hand and is dropped on the
      // next event: it reduces the feeling of lag.
      const predicted = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      this.predicted = predicted.slice(0, 2).map((event) => this.toPage(event));
      this.requestLive();
    }
  }

  /** Adds a point to the stroke in progress. Points that land almost on top of
   *  the previous one (the mouse can send hundreds per second) add nothing:
   *  they are skipped, so the stroke weighs less to save and to compute. */
  private addPoint(point: Point): void {
    const points = this.current?.points;
    if (!points) return;
    const last = points[points.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_STEP / this.scale && Math.abs(point[2] - last[2]) < 0.05) return;
    points.push(point);
  }

  private pointerUp(e: PointerEvent): void {
    if (this.live.hasPointerCapture(e.pointerId)) this.live.releasePointerCapture(e.pointerId);
    if (this.grab && e.pointerId === this.pointerId) {
      const { original } = this.grab;
      this.grab = null;
      this.guides = [];
      this.pointerId = null;
      const shape = this.selected;
      if (shape && shape !== original) {
        // Put back how it was and record the change, to undo it in one step.
        const index = this.strokes.indexOf(shape);
        if (index >= 0) this.strokes[index] = original;
        this.selected = original;
        this.replaceShape(original, shape);
      }
      return;
    }
    if (!this.current || e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const stroke = this.current;
    this.current = null;
    this.predicted = [];
    this.guides = [];
    // A tap with a shape chosen draws nothing.
    if (stroke.shape && stroke.points[0][0] === stroke.points[1][0] && stroke.points[0][1] === stroke.points[1][1]) {
      this.paintLive();
      this.endLive();
      return;
    }
    const bounds = computeBounds(stroke);
    this.bounds.set(stroke, bounds);
    if (stroke.erase) {
      cancelAnimationFrame(this.eraseFrame);
      this.eraseFrame = 0;
      this.paintErase(stroke);
      this.snapshots = [];
      // A pass that touched no drawing is not saved.
      if (!this.strokes.some((s) => !s.erase && overlaps(this.bounds.get(s), s.size / 2, bounds, stroke.size / 2))) return;
    } else {
      // The stroke moves to its layer of finished strokes without repainting everything.
      // The layer already has the stroke: it is finished painting without the prediction.
      cancelAnimationFrame(this.liveFrame);
      this.liveFrame = 0;
      this.current = stroke;
      this.paintLive();
      this.current = null;
      if (stroke.effect) {
        // The blend just made is kept now, so repainting only pastes it.
        this.bounds.set(stroke, bounds);
        if (stroke.effect === "watercolor") this.bakeWatercolor(stroke);
        else this.bakeBlend(stroke, this.strokes.length);
      }
      this.endLive();
    }
    this.strokes.push(stroke);
    this.history.push({ type: "add", stroke, index: this.strokes.length - 1 });
    this.undone = [];
    this.onRecord();
    this.onChange();
    // A shape just drawn stays selected, ready to adjust.
    if (stroke.shape) this.select(stroke);
  }

  /** The eraser radius on the page: its size is measured on the screen. */
  private eraserRadius(): number {
    return Math.max(MIN_ERASER_RADIUS, this.eraserSize / 2) / this.scale;
  }

  /** The center of the page where the point is: the middle line across its
   *  width and its height (each page has its own center). */
  private centers([, y]: Point): { x: number; y: number } {
    const sheet = Math.max(0, Math.floor(y / this.sheetHeight));
    return { x: this.page.offsetWidth / 2, y: sheet * this.sheetHeight + this.sheetHeight / 2 };
  }

  private toPage(e: PointerEvent): Point {
    const rect = this.page.getBoundingClientRect();
    const pressure = e.pointerType === "pen" ? e.pressure : 0.5;
    return [round((e.clientX - rect.left) / this.scale), round((e.clientY - rect.top) / this.scale), round(pressure, 100)];
  }

  // ---------- Painting ----------

  private resize(): void {
    if (this.place(true)) this.paintNow();
  }

  /** Places the canvases over the visible part of the page, with a margin above
   *  and below. Returns whether they moved (and need repainting). Without
   *  `force`, they do not move while the visible area stays covered. */
  private place(force: boolean): boolean {
    // Everything is measured in screen pixels; the canvases are inside the
    // page, which grows with the zoom, so their position is written in page
    // units.
    const stageRect = this.stage.getBoundingClientRect();
    const viewRect = this.scroller.getBoundingClientRect();
    const stageW = stageRect.width;
    const stageH = stageRect.height;
    if (!stageW || !stageH) return false;
    const viewW = this.scroller.clientWidth;
    const viewH = this.scroller.clientHeight;
    const vx = viewRect.left - stageRect.left;
    const vy = viewRect.top - stageRect.top;
    // The size of the canvases depends only on the screen, not on the zoom or
    // the length of the page: changing it is costly (the browser creates them
    // again), and whatever falls outside the page is clipped. There is no side
    // margin: sideways scrolling is rare and repainting is cheap.
    const ox = 0;
    const oy = Math.round(viewH * OVERSCAN);
    // Rounded up by steps: while the side list opens or closes, the canvases
    // don't have to be created again at every frame.
    // A canvas that is already big enough is kept unless it is much too big:
    // opening the list makes the view narrower, and nothing has to change.
    const fit = (needed: number, current: number) =>
      current >= needed && current - needed < SIZE_STEP * 3 ? current : Math.max(1, Math.ceil(needed / SIZE_STEP) * SIZE_STEP);
    const width = fit(viewW, this.placed.width);
    const height = fit(viewH + 2 * oy, this.placed.height);
    const dpr = window.devicePixelRatio || 1;
    const p = this.placed;
    const mx = Math.min(ox, EDGE);
    const my = Math.min(oy, EDGE);
    const covered =
      p.width === width &&
      p.height === height &&
      p.dpr === dpr &&
      p.scale === this.scale &&
      p.left <= Math.max(0, vx - mx) &&
      p.top <= Math.max(0, vy - my) &&
      p.left + width >= Math.min(stageW, vx + viewW + mx) &&
      p.top + height >= Math.min(stageH, vy + viewH + my);
    if (covered && !force) return false;
    const left = Math.round(Math.max(0, Math.min(stageW - width, vx - ox)));
    const top = Math.round(Math.max(0, Math.min(stageH - height, vy - oy)));
    const pixelsW = Math.round(width * dpr);
    const pixelsH = Math.round(height * dpr);
    // Nothing changed: no need to move or repaint anything.
    if (p.left === left && p.top === top && p.width === width && p.height === height && p.dpr === dpr && p.scale === this.scale) return false;
    const unit = (n: number) => `${n / this.scale}px`;
    for (const canvas of [...this.bases, this.live]) {
      canvas.style.left = unit(left);
      canvas.style.top = unit(top);
      canvas.style.width = unit(width);
      canvas.style.height = unit(height);
      // Resizing clears the canvas: only if it really changed.
      if (canvas.width !== pixelsW) canvas.width = pixelsW;
      if (canvas.height !== pixelsH) canvas.height = pixelsH;
    }
    this.placed = { left, top, width, height, dpr, scale: this.scale };
    return true;
  }

  private requestLive(): void {
    if (this.liveFrame) return;
    this.liveFrame = requestAnimationFrame(() => {
      this.liveFrame = 0;
      this.paintLive();
    });
  }

  /** Erases from the layers what the pass in progress has covered so far. */
  private requestErase(): void {
    this.requestLive();
    if (this.eraseFrame) return;
    this.eraseFrame = requestAnimationFrame(() => {
      this.eraseFrame = 0;
      if (this.current?.erase) this.paintErase(this.current, true);
    });
  }

  /** Saves how the layers are before erasing: copying a screen-sized image is
   *  cheap, no matter how much is drawn. */
  private takeSnapshots(): void {
    this.snapshots = this.bases.map((canvas, i) => {
      const copy = this.snapshots[i] ?? document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext("2d");
      ctx?.clearRect(0, 0, copy.width, copy.height);
      ctx?.drawImage(canvas, 0, 0);
      return copy;
    });
  }

  /** Each layer goes back to how it was at the start and the whole pass is
   *  removed from it. While erasing (`live`), the pass is drawn on the mask a
   *  piece at a time, and only the part it touched is repainted: a long pass
   *  costs the same each frame as a short one. */
  private paintErase(stroke: Stroke, live = false): void {
    if (!live) {
      this.erased = 0;
      this.layers.forEach((ctx, i) => {
        if (this.snapshots[i]) this.restoreLayer(i as 0 | 1);
        this.withPageTransform(ctx, () => this.fillStroke(ctx, stroke, false));
      });
      return;
    }
    // Only the part where the pass went since the last frame is repainted,
    // with the pieces of the pass that fall there, erased together.
    const points = stroke.points;
    if (!this.erased) this.touched = null;
    const fresh = points.slice(Math.max(0, this.erased - 1));
    this.erased = points.length;
    const r = stroke.size / 2;
    const xs = fresh.map((p) => p[0]);
    const ys = fresh.map((p) => p[1]);
    const { area, pixels } = this.region(Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r);
    if (pixels[2] <= pixels[0] || pixels[3] <= pixels[1]) return;
    // Near the start of the pass, so no decimals are lost at deep zoom.
    const [ox, oy] = [points[0][0], points[0][1]];
    const path = new Path2D();
    const reach = (a: Point, b: Point) =>
      Math.min(a[0], b[0]) - r <= area[2] && Math.max(a[0], b[0]) + r >= area[0] && Math.min(a[1], b[1]) - r <= area[3] && Math.max(a[1], b[1]) + r >= area[1];
    for (let k = 0; k < points.length; k++) {
      const [a, b] = [points[Math.max(0, k - 1)], points[k]];
      // A single point also erases: a segment of no length with round ends is a circle.
      if ((k > 0 || points.length === 1) && reach(a, b)) {
        path.moveTo(a[0] - ox, a[1] - oy);
        path.lineTo(b[0] - ox, b[1] - oy);
      }
    }
    for (const index of [0, 1] as const) {
      this.repaintIn(index, pixels, (ctx) => {
        ctx.translate(ox, oy);
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = stroke.opacity;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = "#000";
        ctx.stroke(path);
      });
    }
  }

  private clearLive(): void {
    if (!this.liveDirty) return;
    this.liveDirty = false;
    this.liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.liveCtx.clearRect(0, 0, this.live.width, this.live.height);
  }

  /** The layer goes back to how it was when the stroke started (only in
   *  `rect`, in canvas pixels, if given). */
  private restoreLayer(index: 0 | 1, rect?: Rect): void {
    const ctx = this.layers[index];
    const snapshot = this.snapshots[index];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const [x, y, w, h] = rect ? [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]] : [0, 0, ctx.canvas.width, ctx.canvas.height];
    if (w <= 0 || h <= 0) return;
    ctx.clearRect(x, y, w, h);
    if (snapshot) ctx.drawImage(snapshot, x, y, w, h, x, y, w, h);
  }

  /** The part to repaint in this frame: what changes now and what changed in
   *  the last frame (the end of the stroke moves). The rest of the layer is
   *  already right. Returned on the page and in canvas pixels. */
  private region(minX: number, minY: number, maxX: number, maxY: number): { area: Rect; pixels: Rect } {
    const now: Rect = [minX, minY, maxX, maxY];
    const t = this.touched;
    this.touched = now;
    const area: Rect = t ? [Math.min(t[0], minX), Math.min(t[1], minY), Math.max(t[2], maxX), Math.max(t[3], maxY)] : now;
    const dpr = window.devicePixelRatio || 1;
    const canvasRect = this.live.getBoundingClientRect();
    const pageRect = this.page.getBoundingClientRect();
    const k = dpr * this.scale;
    const [dx, dy] = [(pageRect.left - canvasRect.left) * dpr, (pageRect.top - canvasRect.top) * dpr];
    const pixels: Rect = [
      Math.max(0, Math.floor(area[0] * k + dx) - 2),
      Math.max(0, Math.floor(area[1] * k + dy) - 2),
      Math.min(this.bases[0].width, Math.ceil(area[2] * k + dx) + 2),
      Math.min(this.bases[0].height, Math.ceil(area[3] * k + dy) + 2),
    ];
    // What the edge pixels touch, on the page.
    const margin = 3 / k;
    return { area: [area[0] - margin, area[1] - margin, area[2] + margin, area[3] + margin], pixels };
  }

  /** Paints in `pixels` only: the layer goes back to how it was there and `draw` paints on it. */
  private repaintIn(index: 0 | 1, pixels: Rect, draw: (ctx: CanvasRenderingContext2D) => void): void {
    const ctx = this.layers[index];
    this.restoreLayer(index, pixels);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pixels[0], pixels[1], pixels[2] - pixels[0], pixels[3] - pixels[1]);
    ctx.clip();
    this.withPageTransform(ctx, () => draw(ctx));
    ctx.restore();
  }

  /** The pen stroke in progress. Recomputing and refilling the whole stroke
   *  every frame made long strokes slower and slower. Here only the part of
   *  the layer where something changed (the new pieces and the end that moves
   *  with the hand) is repainted, with the pieces of the stroke that fall
   *  there, filled together: the transparency is applied once, as in the
   *  finished stroke. A long stroke costs the same each frame as a short one. */
  private paintPen(index: 0 | 1, stroke: Stroke): void {
    if (this.liveReset || !this.liveBrush) {
      // From the start (or again after a repaint, which moves the canvases).
      this.liveBrush = new LiveBrush(stroke);
      this.touched = null;
      this.liveReset = false;
    }
    const brush = this.liveBrush;
    const shown = this.predicted.length ? { ...stroke, points: [...stroke.points, ...this.predicted] } : stroke;
    const { added, end } = brush.update(stroke, shown);
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y, r] of [...added.circles, ...end.circles]) {
      minX = Math.min(minX, x - r);
      minY = Math.min(minY, y - r);
      maxX = Math.max(maxX, x + r);
      maxY = Math.max(maxY, y + r);
    }
    if (minX > maxX) return;
    const { origin, factor } = brush.settled;
    const page = (x: number, y: number): [number, number] => [origin[0] + x / factor, origin[1] + y / factor];
    const { area, pixels } = this.region(...page(minX, minY), ...page(maxX, maxY));
    if (pixels[2] <= pixels[0] || pixels[3] <= pixels[1]) return;
    const local: Rect = [(area[0] - origin[0]) * factor, (area[1] - origin[1]) * factor, (area[2] - origin[0]) * factor, (area[3] - origin[1]) * factor];
    const settled = brush.piecesIn(local);
    this.repaintIn(index, pixels, (ctx) => {
      ctx.translate(origin[0], origin[1]);
      ctx.scale(1 / factor, 1 / factor);
      ctx.globalAlpha = stroke.opacity;
      ctx.fillStyle = (this.colorFor ?? this.resolveColor)(stroke.color);
      ctx.fill(brushPath({ origin, factor, circles: [...settled.circles, ...end.circles], quads: [...settled.quads, ...end.quads] }));
    });
  }

  private paintLive(): void {
    this.clearLive();
    const stroke = this.current;
    if (stroke && !stroke.erase && this.liveLayer !== null) {
      const index = this.liveLayer;
      const ctx = this.layers[index];
      if (worksOnPaint(stroke)) {
        // Blur and smudge are applied touch by touch, without repeating the ones already done.
        if (this.liveReset) {
          this.restoreLayer(index);
          this.dabsDone = 0;
          this.liveReset = false;
        }
        this.withPageTransform(ctx, () => (this.dabsDone = this.paintDabs(ctx, stroke, this.dabsDone)));
        return;
      }
      if (!stroke.shape && !stroke.effect) {
        this.paintPen(index, stroke);
        return;
      }
      this.restoreLayer(index);
      this.withPageTransform(ctx, () => this.fillStroke(ctx, stroke, false));
      this.withPageTransform(this.liveCtx, () => this.paintGuides(this.liveCtx));
      return;
    }
    if (this.selected) {
      this.withPageTransform(this.liveCtx, () => {
        this.paintSelection(this.liveCtx);
        if (this.grab) this.paintGuides(this.liveCtx);
      });
    }
    if (this.tool === "eraser" && this.eraserAt) {
      // A soft circle shows what it is going to erase.
      this.liveDirty = true;
      const dpr = window.devicePixelRatio || 1;
      const ctx = this.liveCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(this.eraserAt.x, this.eraserAt.y, this.eraserRadius() * this.scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(120, 130, 140, 0.9)";
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fill();
      ctx.stroke();
    }
  }

  /** The center guides, thin and dotted, while the shape is snapped to them. */
  private paintGuides(ctx: CanvasRenderingContext2D): void {
    if (!this.guides.length) return;
    this.liveDirty = true;
    const width = this.page.offsetWidth;
    const height = this.page.offsetHeight;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1 / this.scale;
    ctx.setLineDash([5 / this.scale, 4 / this.scale]);
    ctx.strokeStyle = "rgba(214, 84, 140, 0.9)";
    ctx.beginPath();
    for (const guide of this.guides) {
      if (guide.axis === "x") {
        ctx.moveTo(guide.at, 0);
        ctx.lineTo(guide.at, height);
      } else {
        ctx.moveTo(0, guide.at);
        ctx.lineTo(width, guide.at);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private paintBase(): void {
    this.bakeDeadline = performance.now() + BAKE_BUDGET_MS;
    this.bakeDeferred = false;
    this.blurry = false;
    this.layers.forEach((ctx, i) => {
      const front = i === 1;
      // A layer that was empty and still has nothing is not touched: clearing
      // it would make the browser send the whole canvas to the screen again.
      const inked = this.strokes.some((s) => !s.erase && Boolean(s.front) === front);
      if (!inked && !this.layerInked[i]) return;
      this.layerInked[i] = inked;
      // Once an effect waits, the effects above it in this layer wait too:
      // each one is computed over what is under it.
      this.layerWaiting = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      this.withPageTransform(ctx, (top, bottom) => {
        this.visible = { top, bottom };
        this.strokes.forEach((stroke, index) => {
          if (!stroke.erase && Boolean(stroke.front) !== front) return;
          const b = this.bounds.get(stroke);
          // Only the strokes visible on screen are painted.
          if (b && (b.maxY + stroke.size < top || b.minY - stroke.size > bottom)) return;
          this.paintFinished(ctx, stroke, index);
        });
      });
    });
    this.bakeDeadline = Infinity;
    // What waited is computed in the next frames, a little each time.
    if (this.bakeDeferred) this.redraw();
    else if (this.blurry) this.scheduleSharpen();
    // If it repaints in the middle of a stroke (when scrolling the page), how
    // the layers ended up is saved again: the eraser erases what it has covered
    // and the stroke in progress is shown again on its layer.
    if (this.current?.erase) {
      this.takeSnapshots();
      this.erased = 0;
      this.paintErase(this.current, true);
    } else if (this.current) {
      // The stroke in progress is painted on its layer again (it doesn't count
      // among the finished strokes): the next repaint has to clear it.
      if (this.liveLayer !== null) this.layerInked[this.liveLayer] = true;
      this.takeSnapshots();
      this.liveReset = true;
    }
  }

  /** Canvas pixels per page unit. */
  private deviceScale(): number {
    return (window.devicePixelRatio || 1) * this.scale;
  }

  /** A finished stroke. Effects are computed only once and kept as images,
   *  at a resolution that doesn't depend on the zoom (see `bakeScale`): so
   *  repainting (on undo, with zoom, when scrolling far) only pastes images,
   *  however many effects there are and however deep the zoom. While the zoom
   *  is changing, what is kept is pasted as it is (it may look soft for a
   *  moment); once it stops, an effect is computed again only if it can look
   *  clearly sharper. */
  private paintFinished(ctx: CanvasRenderingContext2D, stroke: Stroke, index: number): void {
    if (!stroke.effect) {
      this.fillStroke(ctx, stroke);
      return;
    }
    const saved = this.baked.get(stroke);
    // What is kept is always pasted right away, even if it could be sharper
    // now (after zooming in): it is sharpened later, one at a time, while
    // nothing else is happening (see `sharpen`).
    if (saved && this.bakeScale(stroke) > saved.scale * BAKE_STRETCH) this.blurry = true;
    const fresh = saved ?? null;
    if (!fresh && (this.layerWaiting || performance.now() > this.bakeDeadline)) {
      // Not computed yet and this frame is used up: it shows up in a moment.
      this.layerWaiting = true;
      this.bakeDeferred = true;
      return;
    }
    const image = fresh ?? (stroke.effect === "watercolor" ? this.bakeWatercolor(stroke) : this.bakeBlend(stroke, index));
    if (image) this.pasteEffect(ctx, stroke, image);
    else if (stroke.effect === "watercolor") this.fillStroke(ctx, stroke);
  }

  private pasteEffect(ctx: CanvasRenderingContext2D, stroke: Stroke, image: Baked): void {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (stroke.effect === "watercolor") {
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(image.canvas, image.x, image.y, image.w, image.h);
    } else if (image.mask) {
      // Where the touches went, what was there is replaced by the blended
      // result; elsewhere, nothing changes (and stays sharp).
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(image.mask, image.x, image.y, image.w, image.h);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(image.canvas, image.x, image.y, image.w, image.h);
    }
    ctx.restore();
  }

  /** Sharpening waits for a quiet moment: not while zooming or drawing. */
  private scheduleSharpen(): void {
    if (this.sharpenHandle) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => {
      this.sharpenHandle = 0;
      this.sharpen();
    };
    this.sharpenHandle = idle ? idle(run, { timeout: 1500 }) : window.setTimeout(run, 200);
  }

  /** Computes again, sharper, one blend on screen that was kept at a lower
   *  resolution, and repaints (only pasting). One per quiet moment, so the
   *  window never stops responding. */
  private sharpen(): void {
    if (performance.now() < this.zoomSettles || this.current || this.grab) {
      this.scheduleSharpen();
      return;
    }
    const { top, bottom } = this.visible;
    const index = this.strokes.findIndex((stroke) => {
      if (!stroke.effect) return false;
      const saved = this.baked.get(stroke);
      if (!saved || this.bakeScale(stroke) <= saved.scale * BAKE_STRETCH) return false;
      const b = this.bounds.get(stroke) ?? computeBounds(stroke);
      return b.maxY + stroke.size >= top && b.minY - stroke.size <= bottom;
    });
    if (index < 0) return;
    const stroke = this.strokes[index];
    if (stroke.effect === "watercolor") this.bakeWatercolor(stroke);
    else this.bakeBlend(stroke, index);
    this.redraw();
  }

  /** The resolution an effect is computed at, in image pixels per page unit:
   *  the screen's, but never so much that the image grows past `MAX_BAKE` or
   *  that a touch is wider than `MAX_DAB_RADIUS` (an effect is soft: more
   *  detail costs a lot and hardly shows). */
  private bakeScale(stroke: Stroke): number {
    const b = this.bounds.get(stroke) ?? computeBounds(stroke);
    const side = Math.max(b.maxX - b.minX, b.maxY - b.minY) + stroke.size * 3;
    const wanted = stroke.effect === "watercolor" ? this.deviceScale() * 0.5 : this.deviceScale();
    return Math.max(0.05, Math.min(wanted, MAX_BAKE / side, (MAX_DAB_RADIUS * 2) / Math.max(stroke.size, 0.0001)));
  }

  /** Watercolor as its own image: a soft stroke, ready to multiply with what is underneath. */
  private bakeWatercolor(stroke: Stroke): Baked | null {
    const b = this.bounds.get(stroke) ?? computeBounds(stroke);
    const pad = stroke.size;
    const x = b.minX - pad;
    const y = b.minY - pad;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    // Its edge is soft, so a lower resolution doesn't show (and takes less memory).
    const fit = this.bakeScale(stroke);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(w * fit));
    canvas.height = Math.max(1, Math.ceil(h * fit));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(fit, 0, 0, fit, -x * fit, -y * fit);
    this.fillStroke(ctx, stroke);
    const baked = { canvas, x, y, w, h, scale: fit };
    this.baked.set(stroke, baked);
    return baked;
  }

  /**
   * Blur or smudge, computed in an image of its own instead of on the screen:
   * what is under the stroke on its layer is painted there (the earlier
   * strokes, each blend already computed pasted as it is), the touches are
   * applied, and the result is kept together with where the touches went.
   * It doesn't depend on what is visible or on the zoom.
   */
  private bakeBlend(stroke: Stroke, index: number): Baked | null {
    const b = this.bounds.get(stroke) ?? computeBounds(stroke);
    const pad = stroke.size * 1.3 + 2;
    const left = Math.max(0, b.minX - pad);
    const top = Math.max(0, b.minY - pad);
    const right = Math.min(this.page.offsetWidth, b.maxX + pad);
    const bottom = Math.min(this.page.offsetHeight, b.maxY + pad);
    if (right <= left || bottom <= top) return null;
    const fit = this.bakeScale(stroke);
    const width = Math.max(1, Math.ceil((right - left) * fit));
    const height = Math.max(1, Math.ceil((bottom - top) * fit));
    const canvas = document.createElement("canvas");
    const mask = document.createElement("canvas");
    canvas.width = mask.width = width;
    canvas.height = mask.height = height;
    const ctx = canvas.getContext("2d");
    const maskCtx = mask.getContext("2d");
    if (!ctx || !maskCtx) return null;
    ctx.setTransform(fit, 0, 0, fit, -left * fit, -top * fit);
    ctx.beginPath();
    ctx.rect(0, 0, this.page.offsetWidth, this.page.offsetHeight);
    ctx.clip();
    // What is under it, on its layer.
    const front = Boolean(stroke.front);
    const area: Bounds = { minX: left, minY: top, maxX: right, maxY: bottom };
    for (let i = 0; i < index; i++) {
      const under = this.strokes[i];
      if (!under.erase && Boolean(under.front) !== front) continue;
      const ub = this.bounds.get(under) ?? computeBounds(under);
      if (!overlaps(ub, under.size, area, 0)) continue;
      if (!under.effect) this.fillStroke(ctx, under);
      else {
        const kept = this.baked.get(under) ?? (under.effect === "watercolor" ? this.bakeWatercolor(under) : this.bakeBlend(under, i));
        if (kept) this.pasteEffect(ctx, under, kept);
      }
    }
    this.paintDabs(ctx, stroke, 0, maskCtx);
    // Only what the touches reached is kept: the rest is left as it is on the layer.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
    const baked = { canvas, mask, x: left, y: top, w: width / fit, h: height / fit, scale: fit };
    this.baked.set(stroke, baked);
    return baked;
  }

  /** Draws in page coordinates, even though the canvas only covers the screen. */
  private withPageTransform(ctx: CanvasRenderingContext2D, draw: (top: number, bottom: number) => void): void {
    const dpr = window.devicePixelRatio || 1;
    const canvasRect = this.live.getBoundingClientRect();
    const pageRect = this.page.getBoundingClientRect();
    const offsetX = pageRect.left - canvasRect.left;
    const offsetY = pageRect.top - canvasRect.top;
    const scale = dpr * this.scale;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, offsetX * dpr, offsetY * dpr);
    // It only draws inside the page: whatever goes past the edges is not shown.
    ctx.beginPath();
    ctx.rect(0, 0, this.page.offsetWidth, this.page.offsetHeight);
    ctx.clip();
    try {
      draw(-offsetY / this.scale, (-offsetY + canvasRect.height) / this.scale);
    } finally {
      ctx.restore();
    }
  }

  /** Does the point (on the page) fall inside the page? */
  private onPage([x, y]: Point): boolean {
    return x >= 0 && y >= 0 && x <= this.page.offsetWidth && y <= this.page.offsetHeight;
  }

  private fillStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, finished = true): void {
    let outline = finished ? this.paths.get(stroke) : undefined;
    if (!outline) {
      if (stroke.erase || stroke.shape) {
        const { d, origin, factor } = linePath(stroke);
        outline = { path: new Path2D(d), origin, factor };
      } else {
        const brush = brushShape(stroke, finished);
        outline = { path: brushPath(brush), origin: brush.origin, factor: brush.factor };
      }
      if (finished) this.paths.set(stroke, outline);
    }
    // The outline was computed in a normal-size space: it is moved to its place and scale.
    ctx.save();
    ctx.translate(outline.origin[0], outline.origin[1]);
    ctx.scale(1 / outline.factor, 1 / outline.factor);
    if (worksOnPaint(stroke)) {
      ctx.restore();
      this.paintDabs(ctx, stroke, 0);
      return;
    }
    if (stroke.erase) {
      // The eraser removes what is painted underneath, like in Paint.
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = stroke.opacity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke.size * outline.factor;
      ctx.strokeStyle = "#000";
      ctx.stroke(outline.path);
    } else if (stroke.shape) {
      const resolve = this.colorFor ?? this.resolveColor;
      ctx.globalAlpha = stroke.opacity;
      if (stroke.fill && FILLABLE.includes(stroke.shape)) {
        ctx.fillStyle = resolve(stroke.fill);
        ctx.fill(outline.path);
      }
      if (stroke.outline !== false || !stroke.fill) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = stroke.size * outline.factor;
        ctx.strokeStyle = resolve(stroke.color);
        ctx.stroke(outline.path);
      }
    } else if (stroke.effect === "watercolor") {
      // Watercolor: the color multiplies with what is underneath, like
      // transparent pigments, and its edges melt. The soft edge is the stroke's
      // shadow: the stroke is painted far away (off the page) and its shadow lands here.
      const m = ctx.getTransform();
      const k = Math.hypot(m.a, m.b) || 1;
      const color = (this.colorFor ?? this.resolveColor)(stroke.color);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = stroke.opacity;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = Math.max(1, stroke.size * outline.factor * k * 0.22);
      ctx.shadowOffsetX = SHADOW_SHIFT;
      ctx.translate(-SHADOW_SHIFT / k, 0);
      ctx.fill(outline.path);
    } else {
      ctx.globalAlpha = stroke.opacity;
      ctx.fillStyle = (this.colorFor ?? this.resolveColor)(stroke.color);
      ctx.fill(outline.path);
    }
    ctx.restore();
  }

  /** Blur or smudge: soft touches along the stroke, starting at touch `from`.
   *  Returns how many touches it has made. It works in canvas pixels, but
   *  inside the page clip. */
  private paintDabs(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number, coverage?: CanvasRenderingContext2D): number {
    const smudge = stroke.effect === "smudge";
    const dabs = dabPoints(stroke.points, Math.max(0.01, stroke.size * (smudge ? 0.1 : 0.25)));
    if (dabs.length <= from) return from;
    const m = ctx.getTransform();
    const k = Math.hypot(m.a, m.b) || 1;
    const radius = Math.max(1, (stroke.size / 2) * k);
    const at = ([x, y]: [number, number]): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    // The page, in canvas pixels: what is outside it is never taken or painted.
    const [left, top] = at([0, 0]);
    const [right, bottom] = at([this.page.offsetWidth, this.page.offsetHeight]);
    const page: Rect = [Math.round(left), Math.round(top), Math.round(right), Math.round(bottom)];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.rect(page[0], page[1], page[2] - page[0], page[3] - page[1]);
    ctx.clip();
    for (let i = Math.max(from, smudge ? 1 : 0); i < dabs.length; i++) {
      if (smudge) smudgeDab(ctx, at(dabs[i - 1]), at(dabs[i]), radius, stroke.opacity * 0.9, page);
      else blurDab(ctx, at(dabs[i]), radius, stroke.opacity, page);
      if (coverage) {
        // Where the touch reached: full in the middle, fading at its edge.
        const [x, y] = at(dabs[i]);
        const size = Math.ceil(radius * 2) + 2;
        coverage.drawImage(softMask(size, radius, 1), x - size / 2, y - size / 2);
      }
    }
    ctx.restore();
    return dabs.length;
  }
}

interface Baked {
  canvas: HTMLCanvasElement;
  /** Blur and smudge: where the touches went (the result replaces the layer only there). */
  mask?: HTMLCanvasElement;
  /** Where it goes, on the page. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Image pixels per page unit. */
  scale: number;
}

/** A kept blend is computed again only if it can be this much sharper (it is soft: it barely shows). */
const BAKE_STRETCH = 2;
/** The widest a touch of blur or smudge is computed, in image pixels. */
const MAX_DAB_RADIUS = 48;
/** How long after the last zoom step the drawing is repainted at its new size. */
const ZOOM_REPAINT_MS = 140;
/** How long after the last zoom change kept blends are only pasted, never recomputed. */
const ZOOM_SETTLE_MS = 350;
/** How long a repaint may spend computing effects before leaving the rest for the next frames. */
const BAKE_BUDGET_MS = 12;
/** Documents (and image memory, in pixels: about 64 MB) kept to go back to them quickly. */
const RECENT_DOCUMENTS = 6;
const RECENT_PIXELS = 16_000_000;
/** The longest side of a saved blend, in pixels. */
const MAX_BAKE = 2048;

/** How far away a watercolor stroke is painted so only its soft shadow lands. */
const SHADOW_SHIFT = 20000;

/** Evenly spaced points along the stroke. Adding points at the end does not
 *  change the earlier ones: live, only the new ones are applied. */
export function dabPoints(points: Point[], spacing: number): [number, number][] {
  if (!points.length) return [];
  const dabs: [number, number][] = [[points[0][0], points[0][1]]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (!length) continue;
    let t = spacing - carry;
    while (t <= length) {
      dabs.push([x0 + ((x1 - x0) * t) / length, y0 + ((y1 - y0) * t) / length]);
      t += spacing;
    }
    carry = length - (t - spacing);
  }
  return dabs;
}

// ---------- Blend touches ----------

const scratch = new Map<string, HTMLCanvasElement>();

/** A reusable helper canvas, clean and of the requested size. */
function scratchCanvas(name: string, size: number): CanvasRenderingContext2D | null {
  let canvas = scratch.get(name);
  if (!canvas) scratch.set(name, (canvas = document.createElement("canvas")));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, size, size);
  return ctx;
}

const masks = new Map<string, HTMLCanvasElement>();

/** A soft-edged circle: it says how much of the touch each pixel takes. */
function softMask(size: number, radius: number, alpha: number): HTMLCanvasElement {
  const key = `${size}:${radius.toFixed(1)}:${alpha.toFixed(2)}`;
  const cached = masks.get(key);
  if (cached) return cached;
  if (masks.size > 64) masks.clear();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.4, `rgba(0,0,0,${alpha * 0.75})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  masks.set(key, canvas);
  return canvas;
}

/** Inside the soft circle, replaces what is painted with `patch`: removes the
 *  part the touch takes and adds the touch (so transparency blends too). */
function blendDab(ctx: CanvasRenderingContext2D, patch: CanvasRenderingContext2D, mask: HTMLCanvasElement, x: number, y: number): void {
  const half = mask.width / 2;
  patch.globalCompositeOperation = "destination-in";
  patch.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(mask, x - half, y - half);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(patch.canvas, x - half, y - half);
}

/** left, top, right, bottom, in canvas pixels. */
type Rect = [number, number, number, number];

/**
 * Copies a square of the layer into `patch`, but only what is inside the page:
 * where the square goes past the edge, the page's last row or column of
 * pixels is stretched instead. So a blend at the edge never pulls in the
 * emptiness outside the page (it would look like white smeared in).
 */
function sample(ctx: CanvasRenderingContext2D, patch: CanvasRenderingContext2D, x: number, y: number, size: number, page: Rect): void {
  patch.clearRect(0, 0, size, size);
  const x0 = Math.max(x, page[0]);
  const y0 = Math.max(y, page[1]);
  const x1 = Math.min(x + size, page[2]);
  const y1 = Math.min(y + size, page[3]);
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  patch.drawImage(ctx.canvas, x0, y0, x1 - x0, y1 - y0, x0 - x, y0 - y, x1 - x0, y1 - y0);
  const [il, it, ir, ib] = [Math.round(x0 - x), Math.round(y0 - y), Math.round(x1 - x), Math.round(y1 - y)];
  const c = patch.canvas;
  if (il > 0) patch.drawImage(c, il, it, 1, ib - it, 0, it, il, ib - it);
  if (ir < size) patch.drawImage(c, ir - 1, it, 1, ib - it, ir, it, size - ir, ib - it);
  if (it > 0) patch.drawImage(c, 0, it, size, 1, 0, 0, size, it);
  if (ib < size) patch.drawImage(c, 0, ib - 1, size, 1, 0, ib, size, size - ib);
}

/** Smudge: carries what is painted from the previous touch to this one, like with a finger. */
function smudgeDab(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], radius: number, strength: number, page: Rect): void {
  const size = Math.ceil(radius * 2) + 2;
  const half = size / 2;
  const patch = scratchCanvas("smudge", size);
  if (!patch) return;
  patch.globalCompositeOperation = "source-over";
  sample(ctx, patch, Math.round(from[0] - half), Math.round(from[1] - half), size, page);
  blendDab(ctx, patch, softMask(size, radius, strength), to[0], to[1]);
}

let filters: boolean | null = null;

/** Blur: melts what is painted inside the touch. */
function blurDab(ctx: CanvasRenderingContext2D, at: [number, number], radius: number, strength: number, page: Rect): void {
  const sigma = Math.max(0.6, radius * 0.45);
  const pad = Math.ceil(sigma * 2);
  const size = Math.ceil(radius * 2) + 2 * pad;
  const half = size / 2;
  const patch = scratchCanvas("blur", size);
  const raw = scratchCanvas("blur-raw", size);
  if (!patch || !raw) return;
  raw.globalCompositeOperation = "source-over";
  sample(ctx, raw, Math.round(at[0] - half), Math.round(at[1] - half), size, page);
  filters ??= typeof (patch as { filter?: unknown }).filter === "string";
  patch.globalCompositeOperation = "source-over";
  patch.clearRect(0, 0, size, size);
  if (filters) {
    patch.filter = `blur(${sigma.toFixed(2)}px)`;
    patch.drawImage(raw.canvas, 0, 0, size, size, 0, 0, size, size);
    patch.filter = "none";
  } else {
    // Without filters: shrinking and enlarging again also melts the colors.
    const small = Math.max(1, Math.round(size / Math.max(2, sigma)));
    const tiny = scratchCanvas("blur-small", small);
    if (!tiny) return;
    tiny.imageSmoothingQuality = "high";
    tiny.drawImage(raw.canvas, 0, 0, size, size, 0, 0, small, small);
    patch.imageSmoothingQuality = "high";
    patch.drawImage(tiny.canvas, 0, 0, small, small, 0, 0, size, size);
  }
  blendDab(ctx, patch, softMask(size, radius, strength), at[0], at[1]);
}

interface Outline {
  path: Path2D;
  origin: [number, number];
  factor: number;
}

/** Size at which the outline of a tiny stroke is computed. */
const NORMAL_SIZE = 8;

/** How much to enlarge a tiny stroke to compute it at normal size. */
function normalFactor(size: number): number {
  return size < NORMAL_SIZE / 2 ? NORMAL_SIZE / Math.max(size, 0.00001) : 1;
}

/** The path of the eraser or of a shape: lines of even thickness (drawn with
 *  `lineWidth`), in the same normal-size space. */
export function linePath(stroke: Stroke): { d: string; origin: [number, number]; factor: number } {
  const factor = normalFactor(stroke.size);
  const origin: [number, number] = stroke.points.length ? [stroke.points[0][0], stroke.points[0][1]] : [0, 0];
  const local = stroke.points.map(([x, y]): [number, number] => [(x - origin[0]) * factor, (y - origin[1]) * factor]);
  const f = (n: number) => n.toFixed(2);
  if (stroke.shape && local.length >= 2) {
    const [[x0, y0], [x1, y1]] = [local[0], local[local.length - 1]];
    switch (stroke.shape) {
      case "rect":
        return { d: `M${f(x0)},${f(y0)}H${f(x1)}V${f(y1)}H${f(x0)}Z`, origin, factor };
      case "ellipse": {
        const [cx, cy, rx, ry] = [(x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2];
        return { d: `M${f(cx - rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx + rx)},${f(cy)}A${f(rx)},${f(ry)} 0 1 0 ${f(cx - rx)},${f(cy)}Z`, origin, factor };
      }
      case "arrow": {
        // The head grows with the thickness, without going past half the arrow.
        const length = Math.hypot(x1 - x0, y1 - y0);
        const head = Math.min(length * 0.45, stroke.size * factor * 3.2 + 8);
        const angle = Math.atan2(y1 - y0, x1 - x0);
        const wing = (side: number) => [x1 - head * Math.cos(angle + side * 0.45), y1 - head * Math.sin(angle + side * 0.45)];
        const [ax, ay] = wing(1);
        const [bx, by] = wing(-1);
        return { d: `M${f(x0)},${f(y0)}L${f(x1)},${f(y1)}M${f(ax)},${f(ay)}L${f(x1)},${f(y1)}L${f(bx)},${f(by)}`, origin, factor };
      }
      default:
        return { d: `M${f(x0)},${f(y0)}L${f(x1)},${f(y1)}`, origin, factor };
    }
  }
  const points = local.map(([x, y]) => `${f(x)},${f(y)}`);
  // A single point also erases: a zero-length segment with round caps is a circle.
  if (points.length === 1) points.push(points[0]);
  return { d: `M${points.join("L")}`, origin, factor };
}

/** With Shift: even squares and circles, and lines every 45°. */
export function constrain(start: Point, end: Point, on: boolean, shape: Shape): Point {
  if (!on) return end;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (shape === "rect" || shape === "ellipse") {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [round(start[0] + Math.sign(dx || 1) * side), round(start[1] + Math.sign(dy || 1) * side), end[2]];
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return [round(start[0] + Math.cos(angle) * length), round(start[1] + Math.sin(angle) * length), end[2]];
}

/** How much the stroke thins with little pressure, and its curve (as before). */
const THINNING = 0.6;
const ease = (t: number) => Math.sin((t * Math.PI) / 2);

/** A freehand stroke as circles (one per point, with the radius the pressure
 *  gives) and the segments that join each pair of consecutive circles. */
export interface Brush {
  origin: [number, number];
  factor: number;
  circles: [x: number, y: number, r: number][];
  /** Each segment is a quadrilateral, always with the same winding. */
  quads: [number, number][][];
}

/** The shape of a freehand stroke. Since the settings work best on a
 *  normal-size stroke, a tiny stroke (drawn at high zoom) is computed enlarged
 *  and centered on its first point; whoever draws it shrinks it back
 *  (`factor`) and moves it to its place (`origin`).
 *
 *  All pieces wind the same way: filled together ("nonzero" rule) they add up
 *  and never cancel out, so no gaps are left where the stroke crosses itself,
 *  and a transparency is applied only once. */
export function brushShape(stroke: Stroke, finished: boolean): Brush {
  const { origin, factor, nodes } = brushNodes(stroke, finished);
  // Smooth curves between the points, even when the mouse delivers them far apart.
  // The curve passes through every point: without smoothing, it follows the hand exactly.
  const smooth = nodes.length > 2 ? throughPoints(nodes) : nodes;
  const brush: Brush = { origin, factor, circles: [], quads: [] };
  smooth.forEach((node, i) => addCircle(brush, node, i === smooth.length - 1));
  return brush;
}

type BrushNode = [x: number, y: number, r: number];

/** The circles of a freehand stroke before smoothing, and how many of them are
 *  `settled`: they no longer change while the stroke goes on (only the last
 *  one moves with the hand, and the first ones set the starting pressure). */
function brushNodes(stroke: Stroke, finished: boolean): { origin: [number, number]; factor: number; nodes: BrushNode[]; settled: number } {
  const factor = normalFactor(stroke.size);
  const origin: [number, number] = stroke.points.length ? [stroke.points[0][0], stroke.points[0][1]] : [0, 0];
  const size = stroke.size * factor;
  const input = stroke.points.map(([x, y, pressure]): Point => [(x - origin[0]) * factor, (y - origin[1]) * factor, pressure]);
  const sampled = input.length ? getStrokePoints(input, { size, streamline: stroke.streamline, last: finished }) : [];
  // The pressure: the pen's, or the one simulated from the speed (faster, thinner).
  const simulate = (previous: number, distance: number) => {
    const speed = Math.min(1, distance / size);
    return Math.min(1, previous + (Math.min(1, 1 - speed) - previous) * (speed * 0.275));
  };
  let pressure = sampled[0]?.pressure ?? 0.5;
  for (const p of sampled.slice(0, 10)) pressure = (pressure + (stroke.simulatePressure ? simulate(pressure, p.distance) : p.pressure)) / 2;
  const nodes = sampled.map((p): BrushNode => {
    pressure = stroke.simulatePressure ? simulate(pressure, p.distance) : p.pressure;
    return [p.point[0], p.point[1], Math.max(0.01, size * ease(0.5 - THINNING * (0.5 - pressure)))];
  });
  const settled = input.length >= 3 && sampled.length > 10 ? sampled.length - 1 : 0;
  return { origin, factor, nodes, settled };
}

/** Adds a circle to the brush, joined to the previous one. Points almost on
 *  top of each other add nothing: they are skipped, to paint less (the last
 *  one always stays, so the stroke ends where the hand stopped). */
function addCircle(brush: Brush, node: BrushNode, last: boolean, previous = brush.circles[brush.circles.length - 1]): BrushNode {
  if (previous && !last && Math.hypot(node[0] - previous[0], node[1] - previous[1]) <= Math.max(0.3, Math.min(node[2], previous[2]) * 0.15)) return previous;
  brush.circles.push(node);
  const quad = previous ? bridge(previous, node) : null;
  if (quad) brush.quads.push(quad);
  return node;
}

/** A freehand stroke in progress, computed piece by piece. Recomputing the
 *  whole stroke every frame made long strokes slower and slower; here what is
 *  settled is computed (and painted) once, and only the end that still moves
 *  with the hand is computed again. The result is the same as `brushShape`. */
export class LiveBrush {
  /** The pieces that no longer change. */
  readonly settled: Brush;
  /** How many smoothed segments are already in `settled`. */
  private segments = 0;
  /** How many of the settled pieces were already handed out by `update`. */
  private given = { circles: 0, quads: 0 };

  constructor(stroke: Stroke) {
    const factor = normalFactor(stroke.size);
    const origin: [number, number] = stroke.points.length ? [stroke.points[0][0], stroke.points[0][1]] : [0, 0];
    this.settled = { origin, factor, circles: [], quads: [] };
  }

  /** The settled pieces that reach into `area` (in the brush's own units). */
  piecesIn([left, top, right, bottom]: Rect): Brush {
    const { origin, factor } = this.settled;
    const circles = this.settled.circles.filter(([x, y, r]) => x + r >= left && x - r <= right && y + r >= top && y - r <= bottom);
    const quads = this.settled.quads.filter(
      (quad) => quad.some(([x]) => x >= left) && quad.some(([x]) => x <= right) && quad.some(([, y]) => y >= top) && quad.some(([, y]) => y <= bottom),
    );
    return { origin, factor, circles, quads };
  }

  /** Brings the stroke up to date. `shown` is the stroke with the predicted
   *  points (or the stroke itself). Returns the pieces newly settled, to paint
   *  them once, and the end, to paint it in this frame only. */
  update(stroke: Stroke, shown: Stroke = stroke): { added: Brush; end: Brush } {
    const { origin, factor } = this.settled;
    const real = brushNodes(stroke, false);
    const settled = real.settled;
    // The predicted points come after the settled ones and do not change them.
    const nodes = shown === stroke ? real.nodes : brushNodes(shown, false).nodes;
    // Segment i of the curve depends on the points i-1 to i+2: once those are
    // settled, it is too.
    if (nodes.length > 2) {
      while (this.segments <= settled - 3) {
        if (this.segments === 0) addCircle(this.settled, nodes[0], false);
        for (const node of segmentPoints(nodes, this.segments)) addCircle(this.settled, node, false);
        this.segments++;
      }
    }
    const added: Brush = {
      origin,
      factor,
      circles: this.settled.circles.slice(this.given.circles),
      quads: this.settled.quads.slice(this.given.quads),
    };
    this.given = { circles: this.settled.circles.length, quads: this.settled.quads.length };
    const end: Brush = { origin, factor, circles: [], quads: [] };
    let rest: BrushNode[];
    if (nodes.length <= 2) rest = nodes;
    else if (!this.segments) rest = throughPoints(nodes);
    else {
      rest = [];
      for (let i = this.segments; i < nodes.length - 1; i++) rest.push(...segmentPoints(nodes, i));
    }
    let previous = this.settled.circles[this.settled.circles.length - 1];
    rest.forEach((node, i) => (previous = addCircle(end, node, i === rest.length - 1, previous)));
    return { added, end };
  }
}

/** A smooth curve that passes through all the points (Catmull-Rom), with more
 *  in-between points where the points are further apart. */
function throughPoints(nodes: BrushNode[]): BrushNode[] {
  const result: BrushNode[] = [nodes[0]];
  for (let i = 0; i < nodes.length - 1; i++) result.push(...segmentPoints(nodes, i));
  return result;
}

/** The in-between points of the curve from point i to point i+1 (this one included). */
function segmentPoints(nodes: BrushNode[], i: number): BrushNode[] {
  const p0 = nodes[Math.max(0, i - 1)];
  const p1 = nodes[i];
  const p2 = nodes[i + 1];
  const p3 = nodes[Math.min(nodes.length - 1, i + 2)];
  const length = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const steps = Math.min(16, Math.max(1, Math.ceil(length / Math.max(1, Math.min(p1[2], p2[2]) * 0.5))));
  const result: BrushNode[] = [];
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const at = (k: 0 | 1) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
    result.push([at(0), at(1), p1[2] + (p2[2] - p1[2]) * t]);
  }
  return result;
}

/** The segment that joins two circles on the outside (their tangents), or null
 *  if one is inside the other. It always winds the same way as the circles. */
function bridge([x1, y1, r1]: [number, number, number], [x2, y2, r2]: [number, number, number]): [number, number][] | null {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d <= Math.abs(r1 - r2) + 1e-6) return null;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const at = (x: number, y: number, r: number, a: number): [number, number] => [x + r * Math.cos(a), y + r * Math.sin(a)];
  const quad = [at(x1, y1, r1, angle + spread), at(x2, y2, r2, angle + spread), at(x2, y2, r2, angle - spread), at(x1, y1, r1, angle - spread)];
  return turn(quad) < 0 ? quad.reverse() : quad;
}

/** The winding of a polygon (positive: the same as `arc` on a canvas). */
export function turn(points: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

function brushPath(brush: Brush): Path2D {
  const path = new Path2D();
  for (const [x, y, r] of brush.circles) {
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  }
  for (const quad of brush.quads) {
    path.moveTo(quad[0][0], quad[0][1]);
    for (const [x, y] of quad.slice(1)) path.lineTo(x, y);
    // Back to the start with a line, not `closePath`: on a long path, closing
    // looks back through every piece, and a long stroke took seconds.
    path.lineTo(quad[0][0], quad[0][1]);
  }
  return path;
}

// ---------- Center guides ----------

interface Snapped {
  point: Point;
  guides: Guide[];
}

/** A lone point snaps to the middle line if it is close. */
export function snapPoint(point: Point, center: { x: number; y: number }, distance: number): Snapped {
  const guides: Guide[] = [];
  let [x, y] = point;
  if (Math.abs(x - center.x) <= distance) {
    x = center.x;
    guides.push({ axis: "x", at: center.x });
  }
  if (Math.abs(y - center.y) <= distance) {
    y = center.y;
    guides.push({ axis: "y", at: center.y });
  }
  return { point: [x, y, point[2]], guides };
}

/** While a shape is drawn, the end point is nudged slightly so that:
 *  - the shape is centered on the page (its middle on the middle line),
 *  - or its tip touches the middle line,
 *  - or a line is perfectly horizontal or vertical.
 *  In each direction the closest adjustment wins, if it is within `distance`. */
export function snapShape(start: Point, end: Point, shape: Shape, center: { x: number; y: number }, distance: number): Snapped {
  const guides: Guide[] = [];
  const straight = shape === "line" || shape === "arrow";
  const pick = (axis: "x" | "y"): number => {
    const i = axis === "x" ? 0 : 1;
    const c = center[axis];
    const options: { value: number; guide: number }[] = [
      // The middle of the shape on the center: symmetric.
      { value: 2 * c - start[i], guide: c },
      // The tip on the center.
      { value: c, guide: c },
    ];
    // A straight line: the end at the same height (or in the same column) as the start.
    if (straight) options.push({ value: start[i], guide: start[i] });
    let best: { value: number; guide: number } | null = null;
    for (const option of options) {
      const gap = Math.abs(end[i] - option.value);
      if (gap <= distance && (!best || gap < Math.abs(end[i] - best.value))) best = option;
    }
    if (!best) return end[i];
    guides.push({ axis, at: best.guide });
    return best.value;
  };
  const x = pick("x");
  const y = pick("y");
  return { point: [round(x), round(y), end[2]], guides };
}

/** A shape moved or resized by a handle snaps to the middle of the page:
 *  - moved: its middle (or one of its sides) on the middle line;
 *  - resized: the side that moves mirrors the one that stays (symmetric
 *    around the middle), or lands on the middle line;
 *  - a line's end: as when drawing it (see `snapShape`).
 *  In each direction the closest adjustment wins, if it is within `distance`. */
export function snapDrag(points: [Point, Point], kind: Grab, shape: Shape, center: { x: number; y: number }, distance: number): { points: [Point, Point]; guides: Guide[] } {
  const [a, b] = points;
  if (kind === "start" || kind === "end") {
    const [fixed, moving] = kind === "start" ? [b, a] : [a, b];
    const snapped = snapShape(fixed, moving, shape, center, distance);
    return { points: kind === "start" ? [snapped.point, b] : [a, snapped.point], guides: snapped.guides };
  }
  const guides: Guide[] = [];
  const next: [Point, Point] = [[...a], [...b]];
  for (const axis of ["x", "y"] as const) {
    const i = axis === "x" ? 0 : 1;
    const c = center[axis];
    const closest = (options: number[]): number | null => {
      let best: number | null = null;
      for (const value of options) if (Math.abs(value) <= distance && (best === null || Math.abs(value) < Math.abs(best))) best = value;
      return best;
    };
    const [lo, hi] = [Math.min(a[i], b[i]), Math.max(a[i], b[i])];
    if (kind === "move") {
      const shift = closest([c - (lo + hi) / 2, c - lo, c - hi]);
      if (shift === null) continue;
      next[0][i] += shift;
      next[1][i] += shift;
    } else {
      // Only the sides being pulled move: the handle names them (n, s, e, w).
      const low = axis === "x" ? kind.includes("w") : kind.includes("n");
      const high = axis === "x" ? kind.includes("e") : kind.includes("s");
      if (!low && !high) continue;
      const [moving, fixed] = low ? [lo, hi] : [hi, lo];
      const shift = closest([2 * c - fixed - moving, c - moving]);
      if (shift === null) continue;
      // The box is kept as top-left and bottom-right (see `dragged`).
      next[low ? 0 : 1][i] = moving + shift;
    }
    guides.push({ axis, at: c });
  }
  return { points: next, guides };
}

/** Completes the strokes saved by the first version, which did not have this data. */
/** Whether saved strokes are the same as the ones kept (same order and shape). */
function sameStrokes(kept: Stroke[], saved: Stroke[]): boolean {
  if (kept.length !== saved.length) return false;
  return kept.every((a, i) => {
    const b = saved[i];
    const n = a.points.length;
    if (n !== b.points.length || a.color !== b.color || a.size !== b.size || a.effect !== b.effect) return false;
    if ((a.opacity ?? 1) !== (b.opacity ?? 1) || Boolean(a.erase) !== Boolean(b.erase) || Boolean(a.front) !== Boolean(b.front)) return false;
    if ((a.shape ?? null) !== (b.shape ?? null) || (a.fill ?? null) !== (b.fill ?? null) || (a.outline ?? true) !== (b.outline ?? true)) return false;
    const same = (p: Point, q: Point) => p[0] === q[0] && p[1] === q[1];
    return n === 0 || (same(a.points[0], b.points[0]) && same(a.points[n - 1], b.points[n - 1]) && same(a.points[n >> 1], b.points[n >> 1]));
  });
}

function normalize(stroke: Partial<Stroke> & Pick<Stroke, "color" | "size" | "points">): Stroke {
  return {
    ...stroke,
    streamline: stroke.streamline ?? 0,
    simulatePressure: stroke.simulatePressure ?? true,
    opacity: stroke.opacity ?? 1,
    erase: stroke.erase ?? false,
    // An unknown shape (from a future version) is drawn as a freehand stroke.
    shape: SHAPES.includes(stroke.shape as Shape) ? stroke.shape : undefined,
    front: stroke.front === true ? true : undefined,
    // An unknown effect too: it stays a plain stroke.
    effect: EFFECTS.includes(stroke.effect as Effect) ? stroke.effect : undefined,
    // Only rectangles and ellipses are filled; without a fill, the outline always shows.
    fill: typeof stroke.fill === "string" && FILLABLE.includes(stroke.shape as Shape) ? stroke.fill : undefined,
    outline: stroke.outline === false && typeof stroke.fill === "string" && FILLABLE.includes(stroke.shape as Shape) ? false : undefined,
  };
}

/** Is the point on the shape (its line) or, if filled or selected, inside it? */
function hitsShape(shape: Stroke, [x, y]: Point, reach: number, inside: boolean): boolean {
  const [a, b] = [shape.points[0], shape.points[shape.points.length - 1]];
  const tolerance = shape.size / 2 + reach;
  const filled = inside || Boolean(shape.fill);
  if (shape.shape === "rect") {
    const [l, r, t, bt] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const within = x >= l - tolerance && x <= r + tolerance && y >= t - tolerance && y <= bt + tolerance;
    if (!within) return false;
    if (filled) return true;
    return Math.min(Math.abs(x - l), Math.abs(x - r), Math.abs(y - t), Math.abs(y - bt)) <= tolerance;
  }
  if (shape.shape === "ellipse") {
    const [cx, cy, rx, ry] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2];
    if (rx < 0.0001 || ry < 0.0001) return Math.hypot(x - cx, y - cy) <= tolerance;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (filled && d <= 1) return true;
    return Math.abs(d - 1) * Math.min(rx, ry) <= tolerance;
  }
  // A line or an arrow: close to the segment.
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= tolerance;
}

function clampOpacity(opacity: number): number {
  return round(Math.min(1, Math.max(MIN_OPACITY, opacity)), 100);
}

/** At deep zoom the points need more decimals: 4 are enough for 10,000 %. */
function round(n: number, precision = 10000): number {
  return Math.round(n * precision) / precision;
}

function roundSize(n: number): number {
  return Math.max(0.0001, round(n));
}

/** A copy of the stroke, `dy` further down. */
function moved(stroke: Stroke, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map(([x, y, p]): Point => [x, round(y + dy), p]) };
}

function computeBounds(stroke: Stroke): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of stroke.points) {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
}

/** Do two rectangles touch, each enlarged by its margin? */
export function overlaps(a: Bounds | undefined, marginA: number, b: Bounds, marginB: number): boolean {
  if (!a) return false;
  const m = marginA + marginB;
  return a.minX - m <= b.maxX && b.minX - m <= a.maxX && a.minY - m <= b.maxY && b.minY - m <= a.maxY;
}

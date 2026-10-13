// The drawing tools: pen, blend and eraser with their settings, the shapes
// panel, and the drawing options remembered on this device.

import { t } from "./i18n";
import { type Effect, type InkTool, MIN_OPACITY, type Shape, STREAMLINE_ON, type Stroke } from "./ink";
import { addFavorite, BASIC_COLORS, colorLabel, EFFECT_SIZES, ERASER_SIZES, loadPencil, saveFavorites, savePencil, swatchCss } from "./colors";
import { closePanels } from "./hints";
import { pickColor, renderColors, setupColorMixer, setupPalettes } from "./colorpanel";
import { $, app, inkSettings, ws } from "./state";

const STREAMLINE_KEY = "ourabox.streamline";
const INK_FRONT_KEY = "ourabox.ink.front";
const INK_SNAP_KEY = "ourabox.ink.snap";

/** The blend used when Blend is chosen (remembered even after going back to the pen). */
let blendEffect: Effect = "watercolor";

export function applyInkSettings(changes: Partial<typeof inkSettings>): void {
  Object.assign(inkSettings, changes);
  for (const pane of ws.panes) {
    Object.assign(pane.ink, inkSettings);
  }
}

/** Shapes: the same pen (color, size, transparency) draws lines, arrows, rectangles and ellipses. */
export function setupShapes(): void {
  for (const button of document.querySelectorAll<HTMLElement>("#shape-panel [data-shape]")) {
    button.addEventListener("click", () => {
      const shape = button.dataset.shape === "free" ? null : (button.dataset.shape as Shape);
      applyInkSettings({ shape });
      selectTool("pen");
      renderShapes();
      // Freehand closes the panel; a shape keeps it open to choose its outline and fill.
      if (!shape) closePanels();
    });
  }
  // Each option changes the shape selected (if any) and the next ones.
  const change = (settings: Partial<typeof inkSettings>) => {
    // There is always something visible: without a fill, the outline stays.
    if (settings.shapeFill === null || (settings.shapeFill === undefined && !inkSettings.shapeFill)) settings.shapeOutline = true;
    applyInkSettings(settings);
    savePencilSettings();
    const selected = ws.active.ink.selectedShape;
    if (selected) {
      ws.active.ink.updateSelected({
        size: roundShapeSize(inkSettings.shapeSize / ws.active.ink.zoom),
        opacity: inkSettings.shapeOpacity,
        fill: inkSettings.shapeFill ?? undefined,
        outline: inkSettings.shapeOutline ? undefined : false,
      });
    }
    renderShapes();
  };
  $("shape-size").addEventListener("input", () => change({ shapeSize: Number($<HTMLInputElement>("shape-size").value) }));
  $("shape-clear").addEventListener("input", () => change({ shapeOpacity: Math.max(MIN_OPACITY, 1 - Number($<HTMLInputElement>("shape-clear").value) / 100) }));
  $("shape-outline").addEventListener("change", () => change({ shapeOutline: $<HTMLInputElement>("shape-outline").checked }));
  $("shape-fill").addEventListener("change", () => {
    const on = $<HTMLInputElement>("shape-fill").checked;
    // Filling starts with the color chosen for drawing.
    change({ shapeFill: on ? (inkSettings.shapeFill ?? inkSettings.color) : null });
  });
  $("shape-fill-colors").addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>("[data-fill]");
    if (button) change({ shapeFill: button.dataset.fill! });
  });
  renderShapes();
}

/** A shape's thickness on the page, rounded like the strokes. */
function roundShapeSize(size: number): number {
  return Math.max(0.0001, Math.round(size * 10000) / 10000);
}

/** When a shape is selected, the panel shows its outline, fill and transparency. */
export function shapeSelected(shape: Stroke | null): void {
  if (shape) {
    applyInkSettings({
      shapeSize: Math.min(40, Math.max(1, Math.round(shape.size * ws.active.ink.zoom))),
      shapeOpacity: shape.opacity,
      shapeFill: shape.fill ?? null,
      shapeOutline: shape.outline !== false,
      ...(shape.shape && shape.shape !== "arrow" ? { shape: shape.shape } : {}),
    });
  }
  renderShapes();
}

export function renderShapes(): void {
  const current = inkSettings.shape ?? "free";
  for (const button of document.querySelectorAll<HTMLElement>("#shape-panel [data-shape]")) {
    const on = button.dataset.shape === current;
    button.setAttribute("aria-checked", String(on));
    if (on) $("shape-button").querySelector("svg")!.innerHTML = button.querySelector("svg")!.innerHTML;
  }
  $("shape-button").classList.toggle("on", Boolean(inkSettings.shape));
  const fillable = current === "rect" || current === "ellipse";
  $("shape-panel").classList.toggle("free", !inkSettings.shape);
  $("shape-panel").classList.toggle("fillable", fillable);
  $<HTMLInputElement>("shape-size").value = String(inkSettings.shapeSize);
  $("shape-size-value").textContent = `${inkSettings.shapeSize} px`;
  const clear = Math.round((1 - inkSettings.shapeOpacity) * 100);
  $<HTMLInputElement>("shape-clear").value = String(clear);
  $("shape-clear-value").textContent = `${clear} %`;
  const outline = $<HTMLInputElement>("shape-outline");
  outline.checked = inkSettings.shapeOutline;
  // The outline can only be turned off when there is a fill.
  outline.disabled = !inkSettings.shapeFill || !fillable;
  $<HTMLInputElement>("shape-fill").checked = Boolean(inkSettings.shapeFill);
  const seen = new Set<string>();
  const colors = [inkSettings.color, ...BASIC_COLORS.map((c) => c.hex), ...ws.favorites].filter((c) => !seen.has(c) && Boolean(seen.add(c)));
  $("shape-fill-colors").replaceChildren(
    ...colors.map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.dataset.fill = color;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(color === inkSettings.shapeFill));
      button.style.setProperty("--swatch", swatchCss(color));
      button.title = colorLabel(color);
      button.setAttribute("aria-label", colorLabel(color));
      return button;
    }),
  );
  $("shape-fill-colors").hidden = !inkSettings.shapeFill;
}

type DrawTool = "pen" | "blend" | "eraser";

export function currentTool(): DrawTool {
  return inkSettings.tool === "eraser" ? "eraser" : inkSettings.effect ? "blend" : "pen";
}

export function selectTool(tool: DrawTool): void {
  for (const pane of ws.panes) pane.ink.select(null);
  const ink: InkTool = tool === "eraser" ? "eraser" : "pen";
  applyInkSettings({ tool: ink, effect: tool === "blend" ? blendEffect : null, ...(tool === "blend" ? { shape: null } : {}) });
  if (tool === "blend") renderShapes();
  app.classList.toggle("erasing", tool === "eraser");
  renderSize();
}

// ---------- Pen: color and size ----------

/** A single pen: the color (favorites or any other) and the size, which open on the second click. */
export function setupPencil(): void {
  const pencil = loadPencil();
  blendEffect = pencil.effect;
  applyInkSettings({
    color: pencil.color,
    size: pencil.size,
    opacity: pencil.opacity,
    eraserSize: pencil.eraserSize,
    eraserOpacity: pencil.eraserOpacity,
    effectSize: pencil.effectSize,
    effectStrength: pencil.effectStrength,
    shapeSize: pencil.shapeSize,
    shapeOpacity: pencil.shapeOpacity,
    shapeFill: pencil.shapeFill,
    shapeOutline: pencil.shapeOutline,
  });

  setupColorMixer();
  setupPalettes();
  $("pick-color").addEventListener("click", () => void pickColor());
  $("pin-color").addEventListener("click", () => {
    ws.favorites = addFavorite(ws.favorites, inkSettings.color);
    saveFavorites(ws.favorites);
    renderColors();
  });

  // Each tool has its own controls.
  const slider = (id: string, apply: (value: number) => void) => {
    const input = $<HTMLInputElement>(id);
    input.addEventListener("input", () => {
      apply(Number(input.value));
      savePencilSettings();
      renderSize();
    });
  };
  const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  slider("size-range", (v) => applyInkSettings({ size: between(Math.round(v), 1, 60) }));
  // The pen's transparency is chosen as a percentage (0 is solid); the
  // strength of the eraser and of blending too (100 is the maximum).
  slider("clear-range", (v) => applyInkSettings({ opacity: between(1 - v / 100, MIN_OPACITY, 1) }));
  slider("eraser-size", (v) => applyInkSettings({ eraserSize: between(Math.round(v), ERASER_SIZES.min, ERASER_SIZES.max) }));
  slider("eraser-strength", (v) => applyInkSettings({ eraserOpacity: between(v / 100, MIN_OPACITY, 1) }));
  slider("blend-size", (v) => applyInkSettings({ effectSize: between(Math.round(v), EFFECT_SIZES.min, EFFECT_SIZES.max) }));
  slider("blend-strength", (v) => applyInkSettings({ effectStrength: between(v / 100, MIN_OPACITY, 1) }));
  for (const button of document.querySelectorAll<HTMLElement>("#blend-panel [data-effect]")) {
    button.addEventListener("click", () => {
      blendEffect = button.dataset.effect as Effect;
      selectTool("blend");
      savePencilSettings();
    });
  }

  const streamline = $<HTMLInputElement>("streamline");
  streamline.checked = readFlag(STREAMLINE_KEY);
  applyInkSettings({ streamline: streamline.checked ? STREAMLINE_ON : 0 });
  streamline.addEventListener("change", () => {
    applyInkSettings({ streamline: streamline.checked ? STREAMLINE_ON : 0 });
    writeFlag(STREAMLINE_KEY, streamline.checked);
  });
  // By default the drawing stays behind the text; you can draw on top.
  // Each stroke remembers where it was drawn: changing this does not move what is already drawn.
  const front = $<HTMLInputElement>("ink-front");
  front.checked = readFlag(INK_FRONT_KEY);
  applyInkSettings({ front: front.checked });
  front.addEventListener("change", () => {
    applyInkSettings({ front: front.checked });
    writeFlag(INK_FRONT_KEY, front.checked);
  });
  const snap = $<HTMLInputElement>("ink-snap");
  snap.checked = readFlag(INK_SNAP_KEY);
  applyInkSettings({ snap: snap.checked });
  snap.addEventListener("change", () => {
    applyInkSettings({ snap: snap.checked });
    writeFlag(INK_SNAP_KEY, snap.checked);
  });
  renderColors();
  renderSize();
  renderShapes();
}

/** A yes-or-no option saved on this device (off if it cannot be read). */
export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    // It is back to off next time.
  }
}

export function savePencilSettings(): void {
  const { color, size, opacity, eraserSize, eraserOpacity, effectSize, effectStrength, shapeSize, shapeOpacity, shapeFill, shapeOutline } = inkSettings;
  savePencil({ color, size, opacity, eraserSize, eraserOpacity, effect: blendEffect, effectSize, effectStrength, shapeSize, shapeOpacity, shapeFill, shapeOutline });
}

/** What each way of blending does, shown under its buttons. */
function blendNote(effect: Effect): string {
  switch (effect) {
    case "watercolor":
      return t("main.blend.watercolor");
    case "blur":
      return t("main.blend.blur");
    case "smudge":
      return t("main.blend.smudge");
  }
}

/** Each tool shows whether it is in use and its own settings. */
export function renderSize(): void {
  const tool = currentTool();
  $("pen-tool").setAttribute("aria-pressed", String(tool === "pen"));
  $("blend-tool").setAttribute("aria-pressed", String(tool === "blend"));
  $("eraser").setAttribute("aria-pressed", String(tool === "eraser"));
  const show = (id: string, value: number, text: string) => {
    const input = $<HTMLInputElement>(id);
    if (document.activeElement !== input) input.value = String(value);
    $(`${id === "size-range" ? "size" : id === "clear-range" ? "clear" : id}-value`).textContent = text;
  };
  const transparency = Math.round((1 - inkSettings.opacity) * 100);
  show("size-range", inkSettings.size, t("main.tools.px", { value: inkSettings.size }));
  show("clear-range", transparency, t("main.tools.percent", { value: transparency }));
  const pen = $("pen-panel").querySelector<HTMLElement>(".size-preview span")!;
  pen.style.setProperty("--alpha", String(inkSettings.opacity));
  pen.style.width = pen.style.height = `${Math.min(60, inkSettings.size)}px`;
  pen.style.background = swatchCss(inkSettings.color);
  $("pen-tool").setAttribute("aria-label", t("main.tools.penLabel", { size: inkSettings.size, transparency }));

  const strength = Math.round(inkSettings.eraserOpacity * 100);
  show("eraser-size", inkSettings.eraserSize, t("main.tools.px", { value: inkSettings.eraserSize }));
  show("eraser-strength", strength, t("main.tools.percent", { value: strength }));
  const eraser = $("eraser-panel").querySelector<HTMLElement>(".size-preview span")!;
  eraser.style.setProperty("--alpha", String(inkSettings.eraserOpacity));
  eraser.style.width = eraser.style.height = `${Math.min(64, inkSettings.eraserSize)}px`;
  $("eraser").setAttribute("aria-label", t("main.tools.eraserLabel", { size: inkSettings.eraserSize, strength }));

  const blend = Math.round(inkSettings.effectStrength * 100);
  show("blend-size", inkSettings.effectSize, t("main.tools.px", { value: inkSettings.effectSize }));
  show("blend-strength", blend, t("main.tools.percent", { value: blend }));
  for (const button of document.querySelectorAll<HTMLElement>("#blend-panel [data-effect]")) {
    button.setAttribute("aria-checked", String(button.dataset.effect === blendEffect));
  }
  $("blend-note").textContent = blendNote(blendEffect);
}

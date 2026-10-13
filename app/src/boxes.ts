// Free text boxes: you write wherever you want on the page, not only in
// line. Each box keeps its position and width in page coordinates and the
// size of its letters (`scale`): a box created at high zoom ends up tiny on
// the page, so one file can hold details at any scale.
//
// Boxes move by their grip (top left) and widen from their right edge. A new
// box is as wide as what is written in it, up to a limit where it starts to
// wrap, so a short note stays on one line; once widened by hand, it keeps the
// width it was given. A box that is left empty disappears.
//
// The text of a box is always laid out at normal size and then the whole box
// is shrunk with `scale`: the browser can't lay out letters at fractions of a
// pixel, but it can shrink a block that is already laid out.

import { t } from "./i18n";
import { sanitizeHtml } from "./sanitize";
import type { TextBox } from "./storage";

/** Width of a new box, in screen pixels, before its text decides it. */
const NEW_WIDTH = 300;
/** How wide a box that follows its text can grow before it wraps, in screen pixels. */
const FIT_MAX_WIDTH = 420;
/** Minimum width of a box, in font sizes. */
const MIN_WIDTH_EM = 3;

export class TextBoxes {
  private editable = true;

  constructor(
    private container: HTMLElement,
    private zoom: () => number,
    private onChange: () => void,
  ) {}

  /** Draws a document's boxes. */
  set(boxes: TextBox[]): void {
    this.container.replaceChildren(...boxes.map((box) => this.element(box)));
  }

  /** The boxes as they are saved. Empty ones are not saved. */
  get(): TextBox[] {
    return [...this.container.querySelectorAll<HTMLElement>(".text-box")]
      .map((element) => {
        const text = element.querySelector<HTMLElement>(".box-text")!;
        const fit = element.classList.contains("fit");
        const box: TextBox & { empty?: boolean } = {
          id: element.dataset.id!,
          x: round(parseFloat(element.style.left)),
          y: round(parseFloat(element.style.top)),
          width: round(this.ownWidth(element) * Number(element.dataset.scale)),
          scale: Number(element.dataset.scale),
          html: text.innerHTML,
          empty: !text.textContent?.trim(),
        };
        if (fit) box.fit = true;
        return box;
      })
      .filter((box) => !box.empty)
      .map(({ empty: _, ...box }) => box);
  }

  /** Creates a box at (x, y) on the page, with the letter size seen right now, and leaves it ready for typing. */
  create(x: number, y: number): void {
    const zoom = this.zoom();
    const scale = Math.min(100, Math.max(0.0001, round(1 / zoom)));
    const box: TextBox = { id: newId(), x: round(x), y: round(y), width: round(NEW_WIDTH * scale), scale, html: "", fit: true };
    const element = this.element(box);
    this.container.appendChild(element);
    const text = element.querySelector<HTMLElement>(".box-text")!;
    text.focus({ preventScroll: true });
  }

  /** The lowest point of all boxes, so the page makes room for them. */
  lowest(): number {
    let lowest = 0;
    for (const element of this.container.querySelectorAll<HTMLElement>(".text-box")) {
      lowest = Math.max(lowest, element.offsetTop + element.offsetHeight * Number(element.dataset.scale));
    }
    return lowest;
  }

  setEditable(on: boolean): void {
    this.editable = on;
    for (const text of this.container.querySelectorAll<HTMLElement>(".box-text")) text.contentEditable = String(on);
  }

  private element(box: TextBox): HTMLElement {
    const element = document.createElement("div");
    element.className = "text-box";
    element.dataset.id = box.id;
    element.dataset.scale = String(box.scale);
    element.style.left = `${box.x}px`;
    element.style.top = `${box.y}px`;
    // The width is saved in page units; inside the box it is measured at normal size.
    element.dataset.width = String(box.width / box.scale);
    if (box.fit) {
      element.classList.add("fit");
      element.style.maxWidth = `${FIT_MAX_WIDTH}px`;
    } else {
      element.style.width = `${box.width / box.scale}px`;
    }
    element.style.setProperty("--s", String(box.scale));
    element.style.scale = String(box.scale);

    const grip = document.createElement("div");
    grip.className = "box-grip";
    grip.title = t("boxes.move");
    const text = document.createElement("div");
    text.className = "box-text";
    text.contentEditable = String(this.editable);
    text.spellcheck = true;
    text.innerHTML = sanitizeHtml(box.html);
    const resize = document.createElement("div");
    resize.className = "box-resize";
    resize.title = t("boxes.resize");
    element.append(grip, text, resize);

    text.addEventListener("input", () => this.onChange());
    // Pasting brings in plain text only.
    text.addEventListener("paste", (e) => {
      e.preventDefault();
      const plain = e.clipboardData?.getData("text/plain") ?? "";
      if (plain) document.execCommand("insertText", false, plain);
    });
    // A box that is left empty disappears.
    text.addEventListener("blur", () => {
      if (text.textContent?.trim() || text.querySelector("img")) return;
      element.remove();
      this.onChange();
    });

    this.drag(grip, (dx, dy, start) => {
      element.style.left = `${round(start.left + dx)}px`;
      element.style.top = `${round(start.top + dy)}px`;
    }, element);
    this.drag(resize, (dx, _dy, start) => {
      // `dx` is in page units; the box width is at its own size. Widened by
      // hand, it stops following its text.
      element.classList.remove("fit");
      element.style.maxWidth = "";
      element.style.width = `${round(Math.max(MIN_WIDTH_EM * 17, start.width + dx / box.scale))}px`;
    }, element);
    return element;
  }

  /** The box width at its own size (before `scale`). One that follows its
   *  text is measured, with a pixel to spare so the export, which lays the
   *  text out again, doesn't break its last word onto a new line; hidden (a
   *  pane not in view), it keeps the last width it had. */
  private ownWidth(element: HTMLElement): number {
    if (!element.classList.contains("fit")) return parseFloat(element.style.width);
    const measured = element.offsetWidth;
    if (measured > 0) element.dataset.width = String(measured + 1);
    return Number(element.dataset.width);
  }

  /** Dragging a part of the box; movements are converted to the page's scale. */
  private drag(
    handle: HTMLElement,
    move: (dx: number, dy: number, start: { left: number; top: number; width: number }) => void,
    element: HTMLElement,
  ): void {
    handle.addEventListener("pointerdown", (e) => {
      if (!this.editable || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const zoom = this.zoom();
      const start = {
        x: e.clientX,
        y: e.clientY,
        left: parseFloat(element.style.left),
        top: parseFloat(element.style.top),
        width: this.ownWidth(element),
      };
      element.classList.add("moving");
      const onMove = (event: PointerEvent) => move((event.clientX - start.x) / zoom, (event.clientY - start.y) / zoom, start);
      const onUp = (event: PointerEvent) => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        element.classList.remove("moving");
        this.onChange();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }
}

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

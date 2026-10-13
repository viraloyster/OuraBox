// A pane: a page with its document, its drawing layer, its mode and its saving.
//
// With split view there are two independent panes: you can write in one while
// drawing in the other. Each pane saves on its own, in a queue, so its saves
// never overwrite each other.
//
// Each pane also has the "About this idea" panel (idea.ts), closed by default,
// and can show earlier versions of the document (the history).

import { adoptInlineImages, htmlForSaving, hydrateImages, storeImage } from "./assets";
import { TextBoxes, newId } from "./boxes";
import { adoptInlineStyles, toggleTask, uncheckNewTask } from "./format";
import { TableTools } from "./table";
import { History, type TextState } from "./history";
import { IdeaPanel } from "./idea";
import { errorText, formatNumber, t, translate } from "./i18n";
import { imageFileToDataUrl } from "./images";
import { Ink } from "./ink";
import { caretOffset, placeCaret, readPlace, rememberPlace } from "./place";
import { sanitizeHtml } from "./sanitize";
import { swatchCss } from "./colors";
import { DEFAULT_SHEET, isAppError, NOTE_COLORS, storage, type DocumentData, type DocumentSummary, type Sheet, type TextBox } from "./storage";

const SAVE_DELAY_MS = 500;
const DRAW_SAVE_DELAY_MS = 1500;
/** Zoom goes from 10 % to 10,000 %: you can get close enough to write and
 *  draw tiny details inside the same page. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 100;
const ZOOM_STEP = 1.25;
/** How long after the last zoom step the page is drawn again sharp. */
const ZOOMING_MS = 300;
/** A file has pages of the chosen size (letter by default, at 96 dpi). A
 *  note is narrower and grows with what it holds. */
/** A note is small, like a sticky note or a notepad: it grows with what it holds. */
const NOTE_WIDTH = 460;
const NOTE_MIN_HEIGHT = 320;
/** Free room always left below the last thing written or drawn. */
const ROOM_BELOW = 120;
/** Below a note's last line, just enough to keep writing. */
const NOTE_ROOM_BELOW = 48;

export type Mode = "write" | "draw";

export interface PaneEvents {
  /** The pane got attention (a click, focus): it becomes the active one. */
  activate(pane: Pane): void;
  /** A document was saved: the list needs updating. */
  saved(summary: DocumentSummary): void;
  status(text: string): void;
  /** The core said the space is locked: go back to the door. */
  locked(): void;
  resolveColor(color: string): string;
  /** The summaries of all documents, to list the attempts. */
  summaries(): DocumentSummary[];
  open(pane: Pane, id: string): void;
  /** Creates a new attempt of this pane's idea. */
  newAttempt(pane: Pane): void;
  /** Converts this pane's note into a file. */
  convertToFile(pane: Pane): void;
  /** Go deeper: the selected phrase becomes a new root, a document below this one. */
  deepen(pane: Pane, text: string): void;
  /** The roots a document is born from, from the highest to the closest. */
  /** Changes the label or color of this pane's note. */
  noteMeta(pane: Pane, meta: { label?: string; color?: string }): void;
  /** A text box was placed: the tool goes back to its place. */
  boxPlaced(pane: Pane): void;
  /** The file's pages changed (size or number). */
  sheetChanged(pane: Pane): void;
}

/** How a page appears: when switching documents, going down to a root or coming up. */
export type Motion = "appear" | "down" | "up";
const LEAVE_MS = 320;

export class Pane {
  readonly root: HTMLElement;
  readonly ink: Ink;
  readonly idea: IdeaPanel;
  readonly boxes: TextBoxes;
  /** The events the pane listens to across the whole document: released when it closes. */
  private listeners = new AbortController();
  /** What the page shows: the document, or an earlier version. */
  private shown: DocumentData | null = null;
  /** The text box tool is ready: the next tap creates a box. */
  boxTool = false;
  /** Until the person picks a zoom, the page fits itself to the pane's width. */
  private autoFit = true;
  /** Wheel zoom steps waiting for the next frame, and where the pointer was. */
  private zoomFactor = 1;
  private zoomAnchor: { x: number; y: number } | null = null;
  private zoomFrame = 0;
  private zoomingTimer = 0;
  document: DocumentData | null = null;
  mode: Mode = "write";
  /** Showing an earlier version: the page is read-only. */
  previewing = false;

  private scroller: HTMLElement;
  private frame: HTMLElement;
  private page: HTMLElement;
  private zoomLabel: HTMLElement;
  private editor: HTMLElement;
  private tables: TableTools;
  /** One undo for what is written and what is drawn (see history.ts). */
  private history: History;
  private nextStep: HTMLElement;
  private dirty = false;
  private saveTimer = 0;
  private saving: Promise<void> = Promise.resolve();
  /** Changes with each document shown: keeps one document's images from arriving late in another. */
  private showToken = 0;
  private placeTimer = 0;
  /** The cursor to restore the next time the page gets focus. */
  private pendingCaret: number | null = null;
  /** When a document opens, the page stays pinned at the saved place (in page
   *  coordinates) even if it changes size: when images load, when the screen
   *  splits. It is released when the person moves on their own. */
  private pinned = false;
  private wantedScroll = 0;
  private wantedLeft = 0;

  constructor(readonly events: PaneEvents) {
    this.root = document.createElement("section");
    this.root.className = "pane";
    this.root.innerHTML = `
      <div class="scroller">
        <div class="page-frame">
          <article class="page">
            <div class="note-meta" hidden>
              <div class="note-colors" role="radiogroup" aria-label="${t("pane.noteColors")}"></div>
              <input class="note-label-input" type="text" maxlength="24" placeholder="${t("pane.label")}" aria-label="${t("pane.noteLabel")}" spellcheck="false" />
            </div>
            <div class="next-step" hidden>
              <button class="next-done" title="${t("pane.nextDone")}" aria-label="${t("pane.nextDoneLabel")}"></button>
              <span class="next-text"></span>
            </div>
            <div class="editor" contenteditable="true" spellcheck="true"></div>
            <div class="boxes"></div>
            <div class="ink-stage">
              <canvas class="ink behind" aria-hidden="true"></canvas>
              <canvas class="ink front" aria-hidden="true"></canvas>
              <canvas class="ink live" aria-hidden="true"></canvas>
            </div>
          </article>
        </div>
      </div>
      <button class="pane-idea icon-button" title="${t("idea.title")}" aria-label="${t("idea.title")}" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></svg>
      </button>
      <button class="pane-convert icon-button" title="${t("pane.convertHint")}" aria-label="${t("pane.convert")}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4M12 11v6M9 14h6" /></svg>
      </button>
      <div class="root-pill" hidden>
        <button type="button" class="root-pill-button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10" /><path d="M12 14c0 3-3 4-5 6M12 14c0 3 3 4 5 6M12 17v4" /></svg>
          <span class="root-pill-label">${t("pane.deepen")}</span>
        </button>
      </div>
      <div class="zoom" role="group" aria-label="${t("pane.zoom")}">
        <button class="zoom-out" aria-label="${t("pane.zoomOut")}" data-hint="${t("pane.zoomOut")}" data-hint-side="left">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
        </button>
        <button class="zoom-level" aria-label="${t("pane.zoomLevel")}" data-hint="${t("pane.zoomLevelHint")}" data-hint-side="left">${zoomText(1)}</button>
        <button class="zoom-in" aria-label="${t("pane.zoomIn")}" data-hint="${t("pane.zoomIn")}" data-hint-side="left">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
        </button>
      </div>`;
    this.scroller = this.root.querySelector(".scroller")!;
    this.frame = this.root.querySelector(".page-frame")!;
    this.page = this.root.querySelector(".page")!;
    this.zoomLabel = this.root.querySelector(".zoom-level")!;
    this.editor = this.root.querySelector(".editor")!;
    this.nextStep = this.root.querySelector(".next-step")!;
    const [behind, front, live] = this.root.querySelectorAll("canvas");

    this.ink = new Ink([behind, front], live, this.page, this.scroller, (color) => events.resolveColor(color), () => {
      this.updatePageHeight();
      this.scheduleSave();
    });
    this.boxes = new TextBoxes(this.root.querySelector(".boxes")!, () => this.ink.zoom, () => {
      this.history.textChanged();
      this.updatePageHeight();
      this.scheduleSave();
    });
    this.tables = new TableTools(this.editor, this.page, this.listeners.signal, () => this.ink.zoom, () => {
      this.history.textChanged();
      this.updatePageHeight();
      this.scheduleSave();
    });
    this.history = new History({
      readText: () => ({ html: htmlForSaving(this.editor), boxes: JSON.stringify(this.boxes.get()) }),
      writeText: (state) => this.writeText(state),
      undoInk: () => this.ink.undo(),
      redoInk: () => this.ink.redo(),
      forgetInkRedo: () => this.ink.forgetRedo(),
    });
    this.ink.onRecord = () => this.history.inkChanged();
    this.idea = new IdeaPanel(this);
    this.root.appendChild(this.idea.root);
    const toggle = this.root.querySelector<HTMLButtonElement>(".pane-idea")!;
    toggle.addEventListener("click", () => this.idea.toggle());
    this.idea.onToggle = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("active", open);
      this.root.classList.toggle("idea-open", open);
    };
    this.root.querySelector(".next-done")!.addEventListener("click", () => this.completeNextStep());
    this.root.querySelector(".pane-convert")!.addEventListener("click", () => events.convertToFile(this));
    this.setupRoots();
    this.setupNoteMeta();
    this.setupZoom();

    this.setupEditor();
    // Any interaction inside the pane makes it the active one.
    this.root.addEventListener("pointerdown", () => events.activate(this), { capture: true });
    this.root.addEventListener("focusin", () => events.activate(this));
  }

  // ---------- Document ----------

  show(document: DocumentData, motion: Motion = "appear"): void {
    if (!this.previewing) this.rememberPlace();
    this.hidePill();
    // Opening another document leaves the earlier version being viewed.
    this.leavePreview();
    this.document = document;
    this.dirty = false;
    this.applyKind();
    this.render(document);
    this.restorePlace(document.id);
    this.idea.render();
    // A soft appearance when switching documents; when going deeper, the new
    // page rises from below, as if going down to the root.
    this.page.classList.remove("appear", "descend", "ascend", "leave-down", "leave-up");
    void this.page.offsetWidth;
    this.page.classList.add(motion === "down" ? "descend" : motion === "up" ? "ascend" : "appear");
  }

  /** The current page says goodbye before going down or up to another root. */
  leave(motion: "down" | "up"): Promise<void> {
    if (!this.document || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
    this.hidePill();
    this.page.classList.remove("appear", "descend", "ascend");
    this.page.classList.add(motion === "down" ? "leave-down" : "leave-up");
    return new Promise((resolve) => window.setTimeout(resolve, LEAVE_MS));
  }

  // ---------- Roots ----------

  /** The phrase selected to go deeper, kept until its root exists. */
  private deepenRange: Range | null = null;
  private pill!: HTMLElement;
  private pillTimer = 0;

  /** Puts the cursor at the end of the text, ready to keep writing. */
  caretToEnd(): void {
    if (this.mode !== "write") return;
    this.editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.selectAllChildren(this.editor);
    selection?.collapseToEnd();
  }

  /** Wraps the selected phrase in a link to its new root. */
  markRoot(id: string): void {
    const range = this.deepenRange;
    this.deepenRange = null;
    if (!range || !this.editor.contains(range.commonAncestorContainer)) return;
    const link = document.createElement("span");
    link.className = "root-link";
    link.dataset.root = id;
    link.appendChild(range.extractContents());
    range.insertNode(link);
    window.getSelection()?.removeAllRanges();
    this.scheduleSave();
  }

  private setupRoots(): void {
    this.pill = this.root.querySelector(".root-pill")!;
    const button = this.pill.querySelector("button")!;
    // The button doesn't take the selection away from the text.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => {
      const target = this.pill.dataset.root;
      this.hidePill();
      if (target) {
        this.events.open(this, target);
        return;
      }
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      const text = range.toString().replace(/\s+/g, " ").trim().slice(0, 120);
      if (!text) return;
      this.deepenRange = range.cloneRange();
      this.events.deepen(this, text);
    });
    document.addEventListener(
      "selectionchange",
      () => {
        clearTimeout(this.pillTimer);
        this.pillTimer = window.setTimeout(() => this.updatePill(), 140);
      },
      { signal: this.listeners.signal },
    );
    this.scroller.addEventListener("scroll", () => this.hidePill(), { passive: true });
    this.editor.addEventListener("keydown", () => this.hidePill());
  }

  /** With a phrase selected, "Go deeper" appears; with the cursor on a root, "Go to this root". */
  private updatePill(): void {
    const selection = window.getSelection();
    if (!this.document || this.previewing || this.mode !== "write" || !selection?.rangeCount) return this.hidePill();
    const range = selection.getRangeAt(0);
    if (!this.editor.contains(range.commonAncestorContainer)) return this.hidePill();
    const node = range.startContainer;
    const link = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(".root-link");
    const label = this.pill.querySelector(".root-pill-label")!;
    if (range.collapsed && link && this.editor.contains(link)) {
      this.pill.dataset.root = link.dataset.root ?? "";
      label.textContent = t("pane.goToRoot");
      this.showPill(link.getBoundingClientRect());
    } else if (!range.collapsed && range.toString().trim()) {
      delete this.pill.dataset.root;
      label.textContent = t("pane.deepen");
      this.showPill(range.getBoundingClientRect());
    } else {
      this.hidePill();
    }
  }

  private showPill(target: DOMRect): void {
    const box = this.root.getBoundingClientRect();
    this.pill.style.left = `${Math.max(12, Math.min(box.width - 12, target.left + target.width / 2 - box.left))}px`;
    this.pill.style.top = `${Math.max(8, target.top - box.top - 46)}px`;
    this.pill.hidden = false;
  }

  private hidePill(): void {
    if (this.pill) this.pill.hidden = true;
  }

  // ---------- Notes: color and label ----------

  private setupNoteMeta(): void {
    const input = this.root.querySelector<HTMLInputElement>(".note-label-input")!;
    const commit = () => {
      if (this.document && input.value.trim() !== this.document.label) this.events.noteMeta(this, { label: input.value });
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        this.editor.focus();
      }
    });
  }

  /** The top row of a note: its color and its label. */
  renderNoteMeta(): void {
    const meta = this.root.querySelector<HTMLElement>(".note-meta")!;
    const note = this.document?.kind === "note" && !this.previewing;
    meta.hidden = !note;
    if (!note || !this.document) return;
    const current = this.document.color ?? "";
    // The note's color is a strip along its top, like a sticky note.
    if (current) this.page.style.setProperty("--note-color", swatchCss(current));
    else this.page.style.removeProperty("--note-color");
    const buttons = ["", ...NOTE_COLORS].map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = color ? "note-swatch" : "note-swatch none";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(color === current));
      button.setAttribute("aria-label", color ? t("pane.noteColor", { name: translate(`pane.colorNames.${color}`) }) : t("pane.noColor"));
      if (color) button.style.setProperty("--swatch", swatchCss(color));
      button.addEventListener("click", () => this.events.noteMeta(this, { color }));
      return button;
    });
    meta.querySelector(".note-colors")!.replaceChildren(...buttons);
    const input = meta.querySelector<HTMLInputElement>(".note-label-input")!;
    if (document.activeElement !== input) input.value = this.document.label;
  }

  /** A note is lighter: a narrower page and no "About this idea" panel. */
  applyKind(): void {
    const note = this.document?.kind === "note";
    this.root.classList.toggle("note", note);
    this.editor.dataset.placeholder = t("pane.placeholder");
    if (note) this.idea.close();
    this.renderNoteMeta();
    // Going from note to file changes the width, the pages and the zoom that fits.
    this.updatePageHeight();
    if (this.autoFit && this.document) this.applyZoom(this.fitZoom());
  }

  /** Clears everything decrypted from the screen. */
  clear(): void {
    clearTimeout(this.saveTimer);
    clearTimeout(this.placeTimer);
    this.pendingCaret = null;
    this.pinned = false;
    this.document = null;
    this.dirty = false;
    this.leavePreview();
    this.showToken++;
    this.editor.innerHTML = "";
    this.boxes.set([]);
    this.shown = null;
    this.ink.setStrokes([]);
    this.history.reset();
    this.renderNextStep();
    this.updatePlaceholder();
    this.idea.close();
    this.idea.render();
  }

  dispose(): void {
    this.clear();
    this.listeners.abort();
    this.ink.dispose();
    this.root.remove();
  }

  focus(): void {
    if (this.mode !== "write" || this.previewing) return;
    this.editor.focus({ preventScroll: true });
    if (this.pendingCaret !== null) {
      // Placing the cursor must not move the page: the place being read wins.
      const { scrollTop, scrollLeft } = this.scroller;
      placeCaret(this.editor, this.pendingCaret);
      this.pendingCaret = null;
      this.scroller.scrollTop = scrollTop;
      this.scroller.scrollLeft = scrollLeft;
    }
  }

  // ---------- Back where you were ----------

  /** Saves how far was read, the cursor and the zoom of the current document. */
  rememberPlace(): void {
    clearTimeout(this.placeTimer);
    if (!this.document || this.previewing) return;
    const zoom = this.ink.zoom;
    rememberPlace(this.document.id, {
      scroll: this.pinned ? this.wantedScroll : Math.round(this.scroller.scrollTop / zoom),
      left: this.pinned ? this.wantedLeft : Math.round(this.scroller.scrollLeft / zoom),
      // 0: fit to width, no zoom chosen.
      zoom: this.autoFit ? 0 : zoom,
      caret: caretOffset(this.editor) ?? this.pendingCaret,
    });
  }

  private schedulePlace(): void {
    if (!this.document || this.previewing) return;
    clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => this.rememberPlace(), 400);
  }

  private restorePlace(id: string): void {
    const place = readPlace(id);
    // With no zoom chosen (or at 100 %), the page fits the pane's width.
    this.autoFit = !place?.zoom || place.zoom === 1;
    this.applyZoom(this.autoFit ? this.fitZoom() : place!.zoom);
    this.pendingCaret = place?.caret ?? null;
    this.wantedScroll = place?.scroll ?? 0;
    this.wantedLeft = place?.left ?? 0;
    this.pinned = true;
    this.applyPin();
  }

  private applyPin(): void {
    if (!this.pinned) return;
    this.scroller.scrollTop = this.wantedScroll * this.ink.zoom;
    this.scroller.scrollLeft = this.wantedLeft * this.ink.zoom;
  }

  private unpin(): void {
    this.pinned = false;
  }

  /** What is painted on the page: the current document or an earlier version. */
  private render(document: DocumentData): void {
    const token = ++this.showToken;
    this.shown = document;
    this.editor.innerHTML = sanitizeHtml(document.html);
    this.applySpacers();
    this.boxes.set(document.boxes ?? []);
    this.ink.setStrokes(document.strokes, document === this.document ? document.id : undefined);
    this.tables.refresh();
    this.pinned = false;
    this.scroller.scrollTop = 0;
    this.renderNextStep();
    this.updatePageHeight();
    this.updatePlaceholder();
    this.history.reset();
    void this.loadImages(token);
  }

  private async loadImages(token: number): Promise<void> {
    await hydrateImages(this.editor);
    if (token !== this.showToken || this.previewing) return;
    // Images change the page height; if it is still pinned, it goes back to the saved place.
    this.updatePageHeight();
    // Older documents saved images embedded: they are moved to separate files.
    if (await adoptInlineImages(this.editor)) this.scheduleSave();
    this.history.rebase();
    this.updatePageHeight();
  }

  // ---------- Next step ----------

  renderNextStep(): void {
    const text = this.previewing ? "" : (this.document?.nextStep ?? "");
    this.nextStep.hidden = !text;
    const line = this.nextStep.querySelector<HTMLElement>(".next-text")!;
    line.textContent = text;
    // The band cuts a long step with an ellipsis; resting the mouse on it shows it whole.
    line.title = text;
  }

  /** Marking the step as done sends it off calmly and lets you choose the next one. */
  private completeNextStep(): void {
    if (!this.document || this.previewing) return;
    this.nextStep.classList.add("done");
    window.setTimeout(() => {
      this.nextStep.classList.remove("done");
      if (!this.document) return;
      this.document.nextStep = "";
      this.renderNextStep();
      this.scheduleSave();
      this.idea.open("next");
    }, 700);
  }

  // ---------- Saving ----------

  scheduleSave(): void {
    if (!this.document || this.previewing) return;
    this.dirty = true;
    this.events.status("");
    clearTimeout(this.saveTimer);
    // While drawing, it waits a little longer: saving builds and encrypts the
    // whole document, and that is best not done between strokes.
    this.saveTimer = window.setTimeout(() => void this.flushSave(), this.mode === "draw" ? DRAW_SAVE_DELAY_MS : SAVE_DELAY_MS);
  }

  /** Saves what is pending right away. Writes go in a queue so they never overwrite each other. */
  flushSave(force = false): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saving = this.saving.then(async () => {
      const document = this.document;
      if (!document || this.previewing || !(this.dirty || force)) return;
      this.dirty = false;
      // A formula being edited is saved as a formula, not as text.
      this.tables.sync();
      document.html = htmlForSaving(this.editor);
      document.boxes = this.boxes.get();
      document.strokes = this.ink.getStrokes();
      // Files from before pages existed record how many they have the first time they are saved.
      if (document.kind === "file" && !this.sheet.pages) this.sheet.pages = this.pageCount();
      // With a name given by the person, the title no longer comes from the first line.
      if (!document.named) document.title = titleFromText(this.editor.innerText);
      this.events.status(t("pane.saving"));
      try {
        const summary = await storage.save(document);
        document.updatedAt = summary.updatedAt;
        document.revision = summary.revision;
        this.events.saved(summary);
        this.events.status(t("pane.saved"));
      } catch (error) {
        if (isAppError(error) && error.code === "locked") {
          this.events.locked();
          return;
        }
        // A conflict is not retried: saving again would overwrite the newer version.
        this.dirty = !(isAppError(error) && error.code === "conflict");
        this.events.status(errorText(error, "pane.saveFailed"));
        console.error(error);
      }
    });
    return this.saving;
  }

  // ---------- History ----------

  /** Shows an earlier version, read-only. The current document does not change. */
  async preview(snapshot: DocumentData): Promise<void> {
    if (!this.previewing) await this.flushSave();
    this.previewing = true;
    this.root.classList.add("previewing");
    this.setMode("write");
    this.editor.contentEditable = "false";
    this.boxes.setEditable(false);
    this.render(snapshot);
  }

  /** Stops showing an earlier version: everything is editable again. */
  private leavePreview(): void {
    this.previewing = false;
    this.root.classList.remove("previewing");
    this.editor.contentEditable = "true";
    this.boxes.setEditable(true);
  }

  /** Back to the present. */
  endPreview(): void {
    if (!this.previewing || !this.document) return;
    this.leavePreview();
    this.render(this.document);
    this.restorePlace(this.document.id);
  }

  /** Brings back the text and drawings of an earlier version. The current
   *  version is not lost: it stays in the history. */
  restore(snapshot: DocumentData): void {
    if (!this.document) return;
    this.document.html = snapshot.html;
    this.document.strokes = snapshot.strokes;
    // Boxes and pages come back with the text and drawing, so they match.
    this.document.boxes = snapshot.boxes ?? [];
    if (snapshot.sheet) this.document.sheet = { ...snapshot.sheet };
    this.endPreview();
    this.dirty = true;
    void this.flushSave();
  }

  // ---------- Mode ----------

  setMode(mode: Mode, focus = true): void {
    if (this.previewing && mode === "draw") return;
    this.mode = mode;
    this.ink.enabled = mode === "draw";
    this.root.classList.toggle("drawing", mode === "draw");
    if (mode === "write" && focus) this.focus();
  }

  // ---------- Zoom ----------

  /** The text page, to format it from the toolbar. */
  get editorElement(): HTMLElement {
    return this.editor;
  }

  /** The whole page (text, boxes and drawing), to export or print it. */
  get pageElement(): HTMLElement {
    return this.page;
  }

  get zoom(): number {
    return this.ink.zoom;
  }

  /** Changes the zoom because the person chose it: from then on, it is respected. */
  setZoom(value: number, anchor?: { x: number; y: number }): void {
    this.autoFit = false;
    this.applyZoom(value, anchor);
  }

  /** While zooming, the page is scaled as an image (cheap); a moment after
   *  the last step it is drawn again, sharp, at its new size. */
  private markZooming(): void {
    this.page.classList.add("zooming");
    clearTimeout(this.zoomingTimer);
    this.zoomingTimer = window.setTimeout(() => this.page.classList.remove("zooming"), ZOOMING_MS);
  }

  /** Changes the page zoom. What is written and drawn doesn't change: only how it looks. */
  private applyZoom(value: number, anchor?: { x: number; y: number }): void {
    let zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    // Close to 100 %, it snaps to exactly 100 %.
    if (Math.abs(zoom - 1) < 0.03) zoom = 1;
    const previous = this.ink.zoom;
    this.unpin();
    if (zoom === previous) return;
    const rect = this.scroller.getBoundingClientRect();
    const x = anchor ? anchor.x - rect.left : this.scroller.clientWidth / 2;
    const y = anchor ? anchor.y - rect.top : this.scroller.clientHeight / 2;
    // The point of the page under the pointer, before the change.
    const frameLeft = this.frame.offsetLeft;
    const pageX = (this.scroller.scrollLeft + x - frameLeft) / previous;
    const pageY = (this.scroller.scrollTop + y) / previous;
    this.markZooming();
    this.ink.zoom = zoom;
    this.zoomLabel.textContent = zoomText(zoom);
    this.root.classList.toggle("zoomed", zoom !== 1);
    this.page.style.setProperty("--inv", String(1 / zoom));
    this.updatePageHeight();
    // What was under the pointer stays under the pointer.
    this.scroller.scrollLeft = pageX * zoom + this.frame.offsetLeft - x;
    this.scroller.scrollTop = pageY * zoom - y;
  }

  /** One zoom step in (1) or out (-1). */
  stepZoom(direction: 1 | -1, anchor?: { x: number; y: number }): void {
    this.setZoom(this.ink.zoom * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP), anchor);
  }

  /** The zoom at which a file's full width fits in the pane (never more than 100 %). */
  fitZoom(): number {
    if (this.document?.kind === "note") return 1;
    const available = this.scroller.clientWidth - 24;
    return available > 0 ? Math.min(1, available / this.sheet.width) : 1;
  }

  private setupZoom(): void {
    this.root.querySelector(".zoom-in")!.addEventListener("click", () => this.stepZoom(1));
    this.root.querySelector(".zoom-out")!.addEventListener("click", () => this.stepZoom(-1));
    // Tapping the percentage: back to 100 %; if already at 100 %, it fits to width.
    this.zoomLabel.addEventListener("click", () => {
      if (this.ink.zoom === 1 && this.fitZoom() < 1) {
        this.autoFit = true;
        this.applyZoom(this.fitZoom());
      } else this.setZoom(1);
    });
    // Ctrl + wheel (or pinching on the touchpad): zooms in or out from the
    // pointer, smoothly, also while drawing.
    this.root.addEventListener(
      "wheel",
      (e) => {
        const onPage = this.scroller.contains(e.target as Node) || e.target instanceof HTMLCanvasElement;
        if (!(e.ctrlKey || e.metaKey) || !onPage) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const factor = Math.exp(-Math.max(-150, Math.min(150, delta)) * 0.0022);
        // The wheel sends more steps than the screen can show: they are added
        // up and applied once per frame.
        this.zoomFactor *= factor;
        this.zoomAnchor = { x: e.clientX, y: e.clientY };
        if (!this.zoomFrame) {
          this.zoomFrame = requestAnimationFrame(() => {
            this.zoomFrame = 0;
            const wanted = this.ink.zoom * this.zoomFactor;
            this.zoomFactor = 1;
            this.setZoom(wanted, this.zoomAnchor ?? undefined);
          });
        }
      },
      { capture: true, passive: false },
    );
    new ResizeObserver(() => {
      // If the pane changes width (when splitting, when showing the list) and no zoom was chosen, it refits.
      if (this.autoFit && this.document && Math.abs(this.fitZoom() - this.ink.zoom) > 0.005) this.applyZoom(this.fitZoom());
      this.layoutPage();
    }).observe(this.scroller);
    new ResizeObserver(() => this.layoutPage()).observe(this.page);
  }

  /** The page is scaled with `scale`; the frame around it takes its scaled
   *  size, so scrolling reaches the whole page. */
  private layoutPage(): void {
    const zoom = this.ink.zoom;
    const note = this.document?.kind === "note";
    // A file always keeps its page width, so the writing, boxes and drawings
    // never shift out of place; a note adapts to the pane.
    const width = note ? Math.min(NOTE_WIDTH, this.scroller.clientWidth) : this.sheet.width;
    this.page.style.setProperty("--page-width", `${width}px`);
    this.page.style.width = `${width}px`;
    // `scale` and not `transform`, so the appear animation doesn't override it.
    this.page.style.scale = zoom === 1 ? "" : String(zoom);
    this.frame.style.width = `${width * zoom}px`;
    this.frame.style.height = `${this.page.offsetHeight * zoom}px`;
    this.applyPin();
  }

  // ---------- Images ----------

  async insertImages(files: File[]): Promise<void> {
    if (this.previewing) return;
    for (const file of files) {
      try {
        const src = await imageFileToDataUrl(file);
        const image = document.createElement("img");
        image.src = src;
        image.dataset.asset = await storeImage(src);
        this.insertAtCaret(image);
      } catch (error) {
        this.events.status(t("images.addFailed"));
        console.error(error);
      }
    }
    this.history.textChanged();
    this.updatePlaceholder();
    this.updatePageHeight();
    this.scheduleSave();
  }

  // ---------- Undo ----------

  /** Undoes the last change to the document, written or drawn. */
  undo(): void {
    if (!this.previewing) this.history.undo();
  }

  redo(): void {
    if (!this.previewing) this.history.redo();
  }

  /** Puts the text back as it was. The cursor goes where the text changed. */
  private writeText(state: TextState): void {
    const focused = this.editor.contains(document.activeElement) || document.activeElement === this.editor;
    const old = this.editor.textContent ?? "";
    this.editor.innerHTML = sanitizeHtml(state.html);
    this.applySpacers();
    this.boxes.set(JSON.parse(state.boxes) as TextBox[]);
    this.tables.refresh();
    void hydrateImages(this.editor).then(() => this.updatePageHeight());
    this.updatePlaceholder();
    this.updatePageHeight();
    this.scheduleSave();
    if (focused || this.mode === "write") {
      const now = this.editor.textContent ?? "";
      let at = 0;
      while (at < old.length && at < now.length && old[at] === now[at]) at++;
      this.editor.focus({ preventScroll: true });
      placeCaret(this.editor, at);
    }
  }

  // ---------- Internal ----------

  private setupEditor(): void {
    this.scroller.addEventListener("scroll", () => this.schedulePlace(), { passive: true });
    // If the person puts the cursor somewhere else, that one wins.
    this.editor.addEventListener("pointerdown", () => (this.pendingCaret = null));
    // Task list checkboxes are ticked with a click.
    this.editor.addEventListener("mousedown", (e) => {
      if (!this.editor.isContentEditable || !toggleTask(e)) return;
      e.preventDefault();
      this.history.textChanged();
      this.scheduleSave();
    });
    // As soon as the person moves on their own, the page is no longer pinned.
    for (const event of ["wheel", "pointerdown", "keydown", "touchstart"]) {
      this.root.addEventListener(event, () => this.unpin(), { passive: true, capture: true });
    }
    document.addEventListener(
      "selectionchange",
      () => {
        if (document.activeElement === this.editor) this.schedulePlace();
      },
      { signal: this.listeners.signal },
    );
    this.editor.addEventListener("input", (e) => {
      if ((e as InputEvent).inputType === "insertParagraph") uncheckNewTask(this.editor);
      adoptInlineStyles(this.editor);
      this.history.textChanged();
      this.updatePlaceholder();
      this.updatePageHeight();
      this.scheduleSave();
    });

    // Undo from the browser's own menu goes to the document's history too.
    this.page.addEventListener("beforeinput", (e) => {
      if (e.inputType !== "historyUndo" && e.inputType !== "historyRedo") return;
      e.preventDefault();
      if (e.inputType === "historyUndo") this.undo();
      else this.redo();
    });

    // Pasting brings in only plain text or images: no foreign HTML.
    this.editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const files = imageFiles(e.clipboardData?.files);
      if (files.length) {
        void this.insertImages(files);
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) document.execCommand("insertText", false, text);
    });

    // Dragging images onto the page adds them; anything else is ignored.
    // (The drawing canvas is inside the page: what is dropped there also arrives here.)
    this.scroller.addEventListener("dragover", (e) => e.preventDefault());
    this.scroller.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = imageFiles(e.dataTransfer?.files);
      if (files.length) void this.insertImages(files);
    });

    // With the box tool ready, tapping the page creates a box there.
    this.page.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.boxTool || this.mode !== "write" || this.previewing || e.button !== 0) return;
        if ((e.target as Element).closest(".text-box")) return;
        e.preventDefault();
        e.stopPropagation();
        this.placeBox(e);
        this.boxTool = false;
        this.events.boxPlaced(this);
      },
      { capture: true },
    );
    // Double click on an empty part of the page: a text box right there.
    this.page.addEventListener("dblclick", (e) => {
      if (e.target !== this.page || this.mode !== "write" || this.previewing) return;
      e.preventDefault();
      this.placeBox(e);
    });

    // Clicking on the empty part of the page goes to the end of the text.
    this.page.addEventListener("mousedown", (e) => {
      if (e.target !== this.page || this.mode !== "write" || this.previewing || this.boxTool || e.detail > 1) return;
      e.preventDefault();
      this.editor.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(this.editor);
      selection?.collapseToEnd();
    });
  }

  private placeBox(e: MouseEvent): void {
    const rect = this.page.getBoundingClientRect();
    const zoom = this.ink.zoom;
    this.boxes.create((e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom);
  }

  private insertAtCaret(node: Node): void {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && this.editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      this.editor.appendChild(node);
    }
  }

  private updatePlaceholder(): void {
    const empty = !this.editor.textContent?.trim() && !this.editor.querySelector("img");
    this.editor.classList.toggle("empty", empty);
  }

  /** A file is as tall as the pages it has. If the writing or drawing goes past
   *  the last one, the page grows just enough (a new page doesn't appear all at
   *  once), unless the person asked for pages to be added automatically. A note
   *  fills the screen and grows with what it holds. */
  private updatePageHeight(): void {
    const note = this.document?.kind === "note";
    this.page.classList.toggle("paged", !note);
    const content = this.contentBottom();
    if (note) {
      const height = Math.max(NOTE_MIN_HEIGHT, content + NOTE_ROOM_BELOW);
      this.page.style.minHeight = `${height}px`;
      // A note is a single page: its center is the middle of its height.
      this.ink.sheetHeight = Math.max(1, height);
    } else {
      const sheet = this.sheet;
      this.ink.sheetHeight = sheet.height;
      this.page.style.setProperty("--sheet-height", `${sheet.height}px`);
      let pages = this.pageCount();
      if (sheet.autoPages && this.document && !this.previewing) {
        const needed = Math.ceil((content + ROOM_BELOW) / sheet.height);
        if (needed > pages && needed <= MAX_PAGES) {
          sheet.pages = pages = needed;
          this.scheduleSave();
          this.events.sheetChanged(this);
        }
      }
      this.page.style.minHeight = `${Math.max(pages * sheet.height, content + ROOM_BELOW)}px`;
    }
    this.layoutPage();
  }

  /** How far the writing reaches. In a file, drawing doesn't count: the pages
   *  have their size and you can paint right up to their edge without them
   *  growing. A note does grow with the drawing, to have room below. */
  private contentBottom(): number {
    const text = Math.max(this.editor.offsetTop + this.editor.offsetHeight, this.boxes.lowest());
    return this.document?.kind === "note" ? Math.max(text, this.ink.lowestPoint()) : text;
  }

  // ---------- Pages ----------

  /** The size of this file's pages and how many it has. */
  get sheet(): Sheet {
    // An earlier version is shown with the pages it had.
    const document = this.previewing ? this.shown : this.document;
    if (!document) return { ...DEFAULT_SHEET, pages: 1 };
    document.sheet ??= { ...DEFAULT_SHEET };
    return document.sheet;
  }

  /** How many pages it has. Files from before pages existed are counted by what they hold. */
  pageCount(): number {
    const sheet = this.sheet;
    return sheet.pages || Math.max(1, Math.ceil((this.contentBottom() + ROOM_BELOW) / sheet.height));
  }

  /** The page in the middle of the screen (from 0). */
  currentSheet(): number {
    const scroller = this.scroller.getBoundingClientRect();
    const middle = (scroller.top + this.scroller.clientHeight / 2 - this.page.getBoundingClientRect().top) / this.ink.zoom;
    return Math.min(this.pageCount() - 1, Math.max(0, Math.floor(middle / this.sheet.height)));
  }

  /** Takes the view to the start of a page. */
  scrollToSheet(index: number): void {
    this.unpin();
    const top = this.page.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top + this.scroller.scrollTop;
    this.scroller.scrollTo({ top: top + index * this.sheet.height * this.ink.zoom - 16, behavior: "smooth" });
  }

  /** Changes the page size (writing and drawing stay where they were). */
  setSheetSize(width: number, height: number): void {
    if (!this.editable()) return;
    const sheet = this.sheet;
    sheet.pages = this.pageCount();
    sheet.width = Math.round(width);
    sheet.height = Math.round(height);
    this.afterSheetChange();
    if (this.autoFit) this.applyZoom(this.fitZoom());
  }

  setAutoPages(on: boolean): void {
    if (!this.editable()) return;
    this.sheet.pages = this.pageCount();
    this.sheet.autoPages = on;
    this.afterSheetChange();
  }

  /** A blank page after page `index`: what came after moves down one page. */
  addSheet(index: number): void {
    if (!this.editable() || this.pageCount() >= MAX_PAGES) return;
    this.wrapLooseText();
    const pages = this.pageCount();
    const height = this.sheet.height;
    const bottom = (index + 1) * height;
    const next = this.blockFrom(bottom);
    const nextTop = next ? this.blockTop(next) : 0;
    this.ink.shiftFrom(bottom, height);
    this.shiftBoxes(bottom, height);
    if (next) this.alignBlock(next, nextTop + height);
    this.sheet.pages = pages + 1;
    this.afterSheetChange();
  }

  /** A copy of page `index` (text, boxes and drawing) right after it. */
  duplicateSheet(index: number): void {
    if (!this.editable() || this.pageCount() >= MAX_PAGES) return;
    this.wrapLooseText();
    const pages = this.pageCount();
    const height = this.sheet.height;
    const top = index * height;
    const bottom = top + height;
    const inside = this.blocksIn(top, bottom);
    const tops = inside.map((block) => this.blockTop(block));
    const next = this.blockAfter(top, bottom);
    const nextTop = next ? this.blockTop(next) : 0;
    this.ink.shiftFrom(bottom, height);
    this.ink.copyBand(top, bottom, height);
    const boxes = this.boxes.get();
    const copies = boxes.filter((b) => b.y >= top && b.y < bottom).map((b) => ({ ...b, id: newId(), y: b.y + height }));
    this.boxes.set([...boxes.map((b) => (b.y >= bottom ? { ...b, y: b.y + height } : b)), ...copies]);
    if (inside.length) {
      // The copied text starts on the new page at the same height as on the original.
      const lead = spacer(0);
      this.editor.insertBefore(lead, next);
      const clones = inside.map((block) => block.cloneNode(true) as HTMLElement);
      for (const clone of clones) this.editor.insertBefore(clone, next);
      this.alignBlock(clones[0], tops[0] + height);
    }
    if (next) this.alignBlock(next, nextTop + height);
    this.sheet.pages = pages + 1;
    this.afterSheetChange();
  }

  /** Removes page `index` with what it holds; what came after moves up one page. */
  removeSheet(index: number): void {
    const pages = this.pageCount();
    if (!this.editable() || pages <= 1) return;
    this.wrapLooseText();
    const height = this.sheet.height;
    const top = index * height;
    const bottom = top + height;
    const inside = this.blocksIn(top, bottom);
    const next = this.blockAfter(top, bottom);
    const nextTop = next ? this.blockTop(next) : 0;
    this.ink.removeBand(top, bottom);
    this.ink.shiftFrom(bottom, -height);
    this.boxes.set(
      this.boxes
        .get()
        .filter((b) => b.y < top || b.y >= bottom)
        .map((b) => (b.y >= bottom ? { ...b, y: b.y - height } : b)),
    );
    for (const block of inside) block.remove();
    if (next) this.alignBlock(next, nextTop - height);
    this.sheet.pages = pages - 1;
    this.afterSheetChange();
  }

  /** Does page `index` hold anything (text, boxes or drawing)? */
  sheetHasContent(index: number): boolean {
    const height = this.sheet.height;
    const [top, bottom] = [index * height, (index + 1) * height];
    const bounds = this.ink.drawingBounds();
    return (
      // Text coming from the page above or continuing onto the page below also counts.
      ([...this.editor.children] as HTMLElement[]).some(
        (b) =>
          !b.dataset.space &&
          this.blockTop(b) < bottom - 0.5 &&
          this.blockBottom(b) > top + 0.5 &&
          Boolean(b.textContent?.trim() || b.querySelector("img, table, hr") || b.matches("img, table, hr")),
      ) ||
      this.boxes.get().some((b) => b.y >= top && b.y < bottom) ||
      Boolean(bounds && this.ink.hasStrokesIn(top, bottom))
    );
  }

  private editable(): boolean {
    return Boolean(this.document && this.document.kind === "file" && !this.previewing);
  }

  private afterSheetChange(): void {
    // The drawing moved with the pages: undoing from before would leave it out of place.
    this.history.reset();
    this.tables.refresh();
    this.updatePlaceholder();
    this.updatePageHeight();
    this.scheduleSave();
    this.events.sheetChanged(this);
  }

  private shiftBoxes(from: number, dy: number): void {
    this.boxes.set(this.boxes.get().map((b) => (b.y >= from ? { ...b, y: b.y + dy } : b)));
  }

  /** Loose text (like the first line, which the browser doesn't put in a
   *  paragraph) moves into its own block, so it can be moved or copied with its page. */
  private wrapLooseText(): void {
    let run: Node[] = [];
    const flush = () => {
      if (run.some((node) => node.textContent?.trim() || (node instanceof Element && node.querySelector("img")) || node.nodeName === "IMG")) {
        const block = document.createElement("div");
        this.editor.insertBefore(block, run[0]);
        block.append(...run);
      }
      run = [];
    };
    for (const node of [...this.editor.childNodes]) {
      if (node instanceof Element && /^(P|DIV|H[1-3]|UL|OL|TABLE|HR|BLOCKQUOTE)$/.test(node.tagName)) flush();
      else run.push(node);
    }
    flush();
  }

  /** Where a text block starts, on the page. */
  private blockTop(block: Element): number {
    return (block.getBoundingClientRect().top - this.page.getBoundingClientRect().top) / this.ink.zoom;
  }

  /** Where a text block ends, on the page. */
  private blockBottom(block: Element): number {
    return (block.getBoundingClientRect().bottom - this.page.getBoundingClientRect().top) / this.ink.zoom;
  }

  /** The text blocks (paragraphs, headings, lists, tables) that lie entirely
   *  between `top` and `bottom`. One that continues onto the page below (a long
   *  list, a table) doesn't count: removing or duplicating the page leaves it alone. */
  private blocksIn(top: number, bottom: number): HTMLElement[] {
    return [...this.editor.children].filter((block): block is HTMLElement => {
      const at = this.blockTop(block);
      return at >= top - 0.5 && at < bottom - 0.5 && this.blockBottom(block) <= bottom + 0.5;
    });
  }

  /** The first block that starts on the page but continues onto the one below,
   *  or if there is none, the first that starts further down: what has to move with the following pages. */
  private blockAfter(top: number, bottom: number): HTMLElement | null {
    const blocks = [...this.editor.children] as HTMLElement[];
    return (
      blocks.find((block) => {
        const at = this.blockTop(block);
        return at >= top - 0.5 && at < bottom - 0.5 && this.blockBottom(block) > bottom + 0.5;
      }) ?? this.blockFrom(bottom)
    );
  }

  /** The first block that starts at `at` or further down. */
  private blockFrom(at: number): HTMLElement | null {
    return ([...this.editor.children] as HTMLElement[]).find((block) => this.blockTop(block) >= at - 0.5) ?? null;
  }

  /** Brings a block to height `wanted` with a blank space before it (or by
   *  shrinking the one already there). The text is not touched. */
  private alignBlock(block: HTMLElement, wanted: number): void {
    const gap = wanted - this.blockTop(block);
    if (Math.abs(gap) < 0.5) return;
    let space = block.previousElementSibling as HTMLElement | null;
    if (!space?.dataset.space) {
      if (gap < 0) return;
      space = spacer(0);
      block.before(space);
    }
    const set = (height: number) => setSpace(space, Math.max(0, height));
    set(space.offsetHeight + gap);
    // Paragraph margins stop collapsing around the space: it is corrected once.
    const error = wanted - this.blockTop(block);
    if (Math.abs(error) >= 0.5) set(space.offsetHeight + error);
    if (space.offsetHeight < 0.5) space.remove();
  }

  /** Blank spaces between blocks (from adding or duplicating pages) take their height. */
  private applySpacers(): void {
    for (const space of this.editor.querySelectorAll<HTMLElement>("[data-space]")) setSpace(space, Number(space.dataset.space));
  }
}

/** A blank space between text blocks, of the requested height. */
function spacer(height: number): HTMLElement {
  const space = document.createElement("div");
  setSpace(space, height);
  return space;
}

function setSpace(space: HTMLElement, height: number): void {
  const value = Math.min(MAX_SPACE, Math.max(0, Math.round(height)));
  space.dataset.space = String(value);
  space.className = "sheet-space";
  space.contentEditable = "false";
  space.style.height = `${value}px`;
}

/** At most, a very tall page: a space never goes beyond this. */
const MAX_SPACE = 2_000_000;
const MAX_PAGES = 500;

/** The zoom to display: 100%, 2,500%… */
export function zoomText(zoom: number): string {
  return `${formatNumber(Math.round(zoom * 100))}%`;
}

export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

export function titleFromText(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.slice(0, 80);
}

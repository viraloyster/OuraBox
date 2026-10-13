// The toolbar: write or draw, the text box tool, the paragraph style, the
// Format and Insert panels and export. Lettering, pages and the drawing
// tools have their own modules.

import { t } from "./i18n";
import { exportImage, exportText, printPage } from "./export";
import { type Align, currentAlign, insertLine, insertTable, setAlign, setInline, toggleChecklist, toggleList } from "./format";
import { imageFiles, type Mode } from "./pane";
import { BASIC_COLORS, colorLabel } from "./colors";
import { closePanels } from "./hints";
import { renderPalettes } from "./colorpanel";
import { newDocument, projectInView } from "./documents";
import { applyInkSettings, currentTool, renderShapes, selectTool, setupPencil, setupShapes } from "./drawtools";
import { setupActivityBar } from "./explorer";
import { setupLetter } from "./lettering";
import { newProject } from "./projects";
import { renderSheet, setupSheet } from "./sheets";
import { $, app, setStatus, ws } from "./state";

const imageInput = $<HTMLInputElement>("image-input");

// ---------- Toolbar ----------

/** The text box tool: the next touch on the page creates a box there. */
export function setBoxTool(on: boolean): void {
  for (const pane of ws.panes) pane.boxTool = false;
  if (ws.active) ws.active.boxTool = on;
  $("text-box-tool").setAttribute("aria-pressed", String(on));
  app.classList.toggle("placing-box", on);
}

/** Write or draw applies to every open file: that way you can draw from one
 *  to another without changing the mode in each. */
export function setMode(mode: Mode): void {
  for (const pane of ws.panes) pane.ink.select(null);
  closePanels();
  setBoxTool(false);
  for (const pane of ws.panes) if (pane !== ws.active) pane.setMode(mode, false);
  ws.active.setMode(mode);
  syncToolbar();
}

/** The toolbar is the same width when writing and when drawing: that way the
 *  buttons never move under the cursor when the mode changes. */
export async function steadyToolbar(): Promise<void> {
  await document.fonts.ready;
  const toolbar = document.querySelector<HTMLElement>(".toolbar")!;
  const write = $("write-tools");
  const draw = $("draw-tools");
  const [writeHidden, drawHidden] = [write.hidden, draw.hidden];
  toolbar.style.minWidth = "";
  write.hidden = false;
  draw.hidden = true;
  const writeWidth = toolbar.offsetWidth;
  write.hidden = true;
  draw.hidden = false;
  const drawWidth = toolbar.offsetWidth;
  [write.hidden, draw.hidden] = [writeHidden, drawHidden];
  toolbar.style.minWidth = `${Math.max(writeWidth, drawWidth)}px`;
}

/** The toolbar shows the tools for the active pane's mode. */
export function syncToolbar(): void {
  const mode = ws.active?.mode ?? "write";
  app.classList.toggle("drawing", mode === "draw");
  $("write-tools").hidden = mode === "draw";
  $("draw-tools").hidden = mode === "write";
  renderPalettes();
  for (const [id, value] of [["mode-write", "write"], ["mode-draw", "draw"]] as const) {
    const button = $(id);
    button.classList.toggle("active", mode === value);
    button.setAttribute("aria-pressed", String(mode === value));
  }
  renderSheet();
}

export function setupToolbar(): void {
  // The header's "+" creates in the project in view, not in the open document's.
  $("new-doc").addEventListener("click", () => void newDocument("file", projectInView()));
  $("new-project").addEventListener("click", () => newProject());
  setupActivityBar();
  $("mode-write").addEventListener("click", () => setMode("write"));
  $("mode-draw").addEventListener("click", () => setMode("draw"));
  $("insert-image").addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => {
    const files = imageFiles(imageInput.files);
    imageInput.value = "";
    if (files.length) void ws.active.insertImages(files);
  });
  $("undo-ink").addEventListener("click", () => ws.active.undo());
  $("redo-ink").addEventListener("click", () => ws.active.redo());
  const boxTool = $("text-box-tool");
  boxTool.addEventListener("mousedown", (e) => e.preventDefault());
  boxTool.addEventListener("click", () => setBoxTool(!ws.active.boxTool));

  for (const button of document.querySelectorAll<HTMLButtonElement>("#write-tools .tool[data-command], #style-panel [data-block]")) {
    // Keeps the button from taking the selection away from the text.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => {
      const block = button.dataset.block;
      if (block) {
        document.execCommand("formatBlock", false, `<${block}>`);
        closePanels();
        renderStyle();
      } else if (button.dataset.command === "insertUnorderedList") toggleList(ws.active.editorElement, "insertUnorderedList");
      else if (button.dataset.command) document.execCommand(button.dataset.command);
      ws.active.scheduleSave();
    });
  }
  $("style-button").addEventListener("mousedown", (e) => e.preventDefault());
  // The style button shows the style of the paragraph where the cursor is.
  document.addEventListener("selectionchange", renderStyle);

  setupFormat();
  setupLetter();
  setupShapes();
  setupExport();
  setupSheet();

  // Pen, Blend and Eraser: a click picks the tool and shows its settings
  // right below (a second click hides them).
  $("pen-tool").addEventListener("click", () => {
    // Going back to the pen is going back to normal drawing: freehand, no blending.
    if (currentTool() !== "pen") {
      applyInkSettings({ shape: null });
      renderShapes();
    }
    selectTool("pen");
  });
  $("blend-tool").addEventListener("click", () => selectTool("blend"));
  $("eraser").addEventListener("click", () => selectTool("eraser"));
  setupPencil();
}

/** Format and Insert: the basics of a word processor, in two panels that open on the second click. */
function setupFormat(): void {
  const run = (button: HTMLElement, action: (editor: HTMLElement) => void, close = false) => {
    // The buttons do not take the selection away from the text.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => {
      const editor = ws.active.editorElement;
      if (!editor.isContentEditable) return;
      if (!editor.contains(window.getSelection()?.anchorNode ?? null)) editor.focus();
      action(editor);
      ws.active.scheduleSave();
      editor.dispatchEvent(new Event("input"));
      renderFormat();
      if (close) closePanels();
    });
  };
  for (const button of document.querySelectorAll<HTMLElement>("#format-panel [data-align]")) {
    run(button, (editor) => setAlign(editor, button.dataset.align as Align));
  }
  for (const button of document.querySelectorAll<HTMLElement>("#format-panel [data-text-color]")) {
    run(button, (editor) => setInline(editor, "data-color", button.dataset.textColor || null));
  }
  const inserts: Record<string, (editor: HTMLElement) => void> = {
    ordered: (editor) => toggleList(editor, "insertOrderedList"),
    tasks: (editor) => toggleChecklist(editor),
    table: () => insertTable(),
    line: () => insertLine(),
  };
  for (const button of document.querySelectorAll<HTMLElement>("#insert-panel [data-insert]")) {
    run(button, inserts[button.dataset.insert!], true);
  }
  // Opening the panels does not take the cursor away from the page either.
  for (const id of ["format-button", "insert-button"]) $(id).addEventListener("mousedown", (e) => e.preventDefault());
  // The drawing colors (basics and favorites) also color the text.
  const drawColors = $("text-draw-colors");
  drawColors.addEventListener("mousedown", (e) => e.preventDefault());
  drawColors.addEventListener("click", (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>("[data-draw-color]");
    if (!button) return;
    const editor = ws.active.editorElement;
    if (!editor.isContentEditable) return;
    if (!editor.contains(window.getSelection()?.anchorNode ?? null)) editor.focus();
    setInline(editor, "data-color", button.dataset.drawColor!);
    ws.active.scheduleSave();
    editor.dispatchEvent(new Event("input"));
  });
  $("format-button").addEventListener("click", renderFormat);
  $("format-button").addEventListener("pointerenter", renderFormat);
}

/** Export: PDF (or print), the image of the drawing and the text. */
function setupExport(): void {
  const actions: Record<string, () => Promise<string | null> | void> = {
    pdf: () => printPage(ws.active, () => ws.panes.forEach((pane) => pane.ink.refresh())),
    png: async () => {
      const name = await exportImage(ws.active);
      if (name === null && !ws.active.ink.drawingBounds() && !ws.active.boxes.get().length) setStatus(t("main.export.noDrawing"));
      return name;
    },
    md: () => exportText(ws.active),
  };
  for (const button of document.querySelectorAll<HTMLElement>("#export-panel [data-export]")) {
    button.addEventListener("click", () => void exportAs(button.dataset.export!));
  }
  async function exportAs(kind: string): Promise<void> {
    closePanels();
    if (!ws.active.document) return;
    try {
      await ws.active.flushSave();
      const saved = await actions[kind]();
      if (saved) setStatus(t("main.export.done", { name: saved }));
    } catch (error) {
      setStatus(t("main.export.failed"));
      console.error(error);
    }
  }
}

const STYLE_LABELS: Record<string, string> = { H1: "H1", H2: "H2" };

function renderStyle(): void {
  const editor = ws.active?.editorElement;
  const node = window.getSelection()?.anchorNode ?? null;
  if (!editor || !node || !editor.contains(node)) return;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const block = element?.closest("h1, h2, p, div, li, td, th");
  const tag = block && editor.contains(block) ? block.tagName : "P";
  const label = STYLE_LABELS[tag] ?? "Aa";
  const current = $("style-button").querySelector(".style-current")!;
  if (current.textContent !== label) current.textContent = label;
  for (const item of document.querySelectorAll<HTMLElement>("#style-panel [data-block]")) {
    item.setAttribute("aria-checked", String(item.dataset.block!.toUpperCase() === (STYLE_LABELS[tag] ? tag : "P")));
  }
}

/** The format panel shows the alignment of the paragraph where the cursor is. */
function renderFormat(): void {
  // The pen's colors that are not already among the text colors: the basics and
  // the favorites mixed by hand.
  const seen = new Set<string>();
  const colors = [...BASIC_COLORS.map((c) => c.hex), ...ws.favorites]
    .map((c) => c.toLowerCase())
    .filter((c) => /^#[0-9a-f]{6}$/.test(c) && !seen.has(c) && Boolean(seen.add(c)));
  $("text-draw-colors").replaceChildren(
    ...colors.map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.dataset.drawColor = color;
      button.style.setProperty("--swatch", color);
      button.title = colorLabel(color);
      button.setAttribute("aria-label", colorLabel(color));
      return button;
    }),
  );
  const align = currentAlign(ws.active.editorElement);
  for (const button of document.querySelectorAll<HTMLElement>("#format-panel [data-align]")) {
    button.setAttribute("aria-checked", String(button.dataset.align === align));
  }
}

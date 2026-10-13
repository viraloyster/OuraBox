// Lettering: bold, italic, outline and size, applied to the last selection on
// the page even after focus moves to the toolbar.

import { formatNumber } from "../core/i18n";
import { currentSize, parseSize, setInline } from "./format";
import { Pane } from "./pane";
import { closePanels } from "../core/hints";
import { $, ws } from "../workspace/state";

// ---------- Lettering: style, outline and size ----------

/** The last selection on the page: typing the size in its box takes focus
 *  away from the page, and the size has to go to what was selected. */
let lastRange: Range | null = null;
/** The page of that selection: with split view, the formatting goes to that
 *  one, not to the one touched afterwards (for example, by dragging its scrollbar). */
let lastPane: Pane | null = null;

/** The page the lettering format goes to. */
function letterTarget(): Pane {
  return lastPane && ws.panes.includes(lastPane) && lastPane.document ? lastPane : ws.active;
}

function restoreSelection(editor: HTMLElement): void {
  const selection = window.getSelection();
  if (selection?.rangeCount && editor.contains(selection.anchorNode)) return;
  editor.focus({ preventScroll: true });
  if (lastRange && editor.contains(lastRange.commonAncestorContainer)) {
    selection?.removeAllRanges();
    selection?.addRange(lastRange);
  }
}

/** Bold, italic, underline and strikethrough in a button that unfolds; the
 *  outline of the letters; and the size in points, typed or picked from the list. */
export function setupLetter(): void {
  const apply = (action: (editor: HTMLElement) => void) => {
    const pane = letterTarget();
    const editor = pane.editorElement;
    if (!editor.isContentEditable) return;
    restoreSelection(editor);
    action(editor);
    pane.scheduleSave();
    editor.dispatchEvent(new Event("input"));
    renderLetter();
  };
  const keep = (element: HTMLElement) => element.addEventListener("mousedown", (e) => e.preventDefault());
  keep($("letter-button"));
  keep($("font-size-button"));
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel button")) keep(button);
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-letter]")) {
    button.addEventListener("click", () =>
      apply(() => {
        const command = button.dataset.letter!;
        const collapsed = window.getSelection()?.isCollapsed ?? true;
        const wanted = !(pendingLetter.get(command) ?? document.queryCommandState(command));
        document.execCommand(command);
        // With nothing selected, the style is for what is typed next. The
        // browser forgets it as soon as the cursor moves (a click on the page),
        // so it is kept here until the next letter.
        if (collapsed) pendingLetter.set(command, wanted);
        else pendingLetter.delete(command);
      }),
    );
  }
  // Just before a letter is typed, the waiting styles are applied where the cursor is.
  document.addEventListener(
    "beforeinput",
    (e) => {
      if (!pendingLetter.size || !(e.inputType === "insertText" || e.inputType === "insertCompositionText")) return;
      const editor = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[contenteditable=true]");
      if (!editor) return;
      for (const [command, wanted] of pendingLetter) {
        if (document.queryCommandState(command) !== wanted) document.execCommand(command);
      }
      pendingLetter.clear();
    },
    true,
  );
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-outline]")) {
    button.addEventListener("click", () => apply((editor) => setInline(editor, "data-outline", button.dataset.outline || null)));
  }
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-outline-color]")) {
    button.addEventListener("click", () =>
      apply((editor) => {
        setInline(editor, "data-outline-color", button.dataset.outlineColor!);
        // Picking a color with no outline makes it thin ("fino"), so it shows.
        if (!outlineAt(editor)) setInline(editor, "data-outline", "fino");
      }),
    );
  }
  const hollow = $("letter-panel").querySelector<HTMLElement>("[data-hollow]")!;
  hollow.addEventListener("click", () =>
    apply((editor) => {
      const on = hollow.getAttribute("aria-pressed") !== "true";
      setInline(editor, "data-hollow", on ? "true" : null);
      if (on && !outlineAt(editor)) setInline(editor, "data-outline", "fino");
    }),
  );

  const input = $<HTMLInputElement>("font-size");
  const setSize = (size: number | null) => {
    if (size === null) return renderLetter();
    apply((editor) => setInline(editor, "data-size", String(size)));
  };
  input.addEventListener("focus", () => input.select());
  // With Enter (or on leaving the box) the typed size is applied, only once.
  let typed = false;
  input.addEventListener("input", () => (typed = true));
  const commit = () => {
    if (!typed) return;
    typed = false;
    setSize(parseSize(input.value));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      restoreSelection(letterTarget().editorElement);
    } else if (e.key === "Escape") {
      typed = false;
      renderLetter();
      restoreSelection(letterTarget().editorElement);
    }
  });
  input.addEventListener("blur", commit);
  for (const button of document.querySelectorAll<HTMLElement>("#font-size-panel [data-font-size]")) {
    keep(button);
    button.addEventListener("click", () => {
      setSize(Number(button.dataset.fontSize));
      closePanels();
    });
  }
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const pane = selection?.rangeCount ? ws.panes.find((p) => p.editorElement.contains(selection.anchorNode)) : undefined;
    if (pane && selection) {
      lastRange = selection.getRangeAt(0).cloneRange();
      lastPane = pane;
      renderLetter();
    }
  });
}

/** The lettering format where the cursor is. */
function formatAt(editor: HTMLElement, attribute: string): string | null {
  const node = window.getSelection()?.anchorNode ?? null;
  const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const holder = element?.closest(`[${attribute}]`);
  return holder && editor.contains(holder) ? holder.getAttribute(attribute) : null;
}

function outlineAt(editor: HTMLElement): string | null {
  return formatAt(editor, "data-outline");
}

/** The lettering button and the size box show what is where the cursor is. */
/** Bold, italic… chosen with nothing selected, waiting for the next letter typed. */
export const pendingLetter = new Map<string, boolean>();

function renderLetter(): void {
  const editor = ws.panes.length ? letterTarget().editorElement : null;
  if (!editor) return;
  const inside = editor.contains(window.getSelection()?.anchorNode ?? null);
  const states: Record<string, boolean> = {};
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-letter]")) {
    const command = button.dataset.letter!;
    const on = inside && (pendingLetter.get(command) ?? document.queryCommandState(command));
    states[button.dataset.letter!] = on;
    button.setAttribute("aria-pressed", String(on));
  }
  $("letter-button").classList.toggle("on", Object.values(states).some(Boolean));
  const outline = inside ? (outlineAt(editor) ?? "") : "";
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-outline]")) {
    button.setAttribute("aria-checked", String(button.dataset.outline === outline));
  }
  const color = inside ? formatAt(editor, "data-outline-color") : null;
  for (const button of document.querySelectorAll<HTMLElement>("#letter-panel [data-outline-color]")) {
    button.setAttribute("aria-checked", String(Boolean(outline) && button.dataset.outlineColor === (color ?? "agua")));
  }
  $("letter-panel").querySelector("[data-hollow]")!.setAttribute("aria-pressed", String(inside && formatAt(editor, "data-hollow") === "true"));
  const input = $<HTMLInputElement>("font-size");
  if (document.activeElement !== input && inside) {
    const size = currentSize(editor);
    input.value = size === null ? "" : formatNumber(size, { useGrouping: false });
  }
}

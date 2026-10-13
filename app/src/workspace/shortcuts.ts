// The keyboard shortcuts, and the saves made when the window loses focus or closes.

import { settingsOpen } from "../space/settings";
import { newDocument } from "./documents";
import { lockSpace, saveEverything } from "../space/session";
import { $, ws } from "./state";
import { setMode } from "../page/toolbar";

/** Whether Ctrl+Z there is for the document. In other fields (a name, the
 *  search) it undoes what is typed in them, as usual. */
function undoesDocument(target: EventTarget | null): boolean {
  if (!isTyping(target)) return true;
  const element = target as HTMLElement;
  return ws.active.root.contains(element) && Boolean(element.closest(".editor, .text-box"));
}

/** Is the key going into a field (a name, a search, a note's label)? */
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT"));
}

export function setupShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    // With the space locked, only the door works.
    if (document.body.classList.contains("locked")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && !e.shiftKey && key === "l") {
      e.preventDefault();
      void lockSpace();
      return;
    }
    // With the settings or the map open (or if Escape already closed a panel),
    // shortcuts do not act on what is behind.
    if (e.defaultPrevented || settingsOpen() || !$("roots").hidden) return;
    if (ctrl && key === "n") {
      e.preventDefault();
      void newDocument(e.shiftKey ? "note" : "file");
    } else if (ctrl && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      ws.active.stepZoom(1);
    } else if (ctrl && e.key === "-") {
      e.preventDefault();
      ws.active.stepZoom(-1);
    } else if (ctrl && e.key === "0") {
      e.preventDefault();
      ws.active.setZoom(1);
    } else if (ctrl && e.shiftKey && key === "d") {
      e.preventDefault();
      setMode(ws.active.mode === "draw" ? "write" : "draw");
    } else if (e.key === "Escape" && ws.active.mode === "draw" && ws.active.ink.selectedShape) {
      // Escape lets go of the selected shape first.
      ws.active.ink.select(null);
    } else if ((e.key === "Delete" || e.key === "Backspace") && ws.active.mode === "draw" && ws.active.ink.selectedShape && !isTyping(e.target)) {
      e.preventDefault();
      ws.active.ink.deleteSelected();
    } else if (e.key === "Escape" && ws.active.mode === "draw") {
      setMode("write");
    } else if (ctrl && (key === "z" || key === "y") && undoesDocument(e.target)) {
      // One undo for the document: what was written and what was drawn, in
      // the order it was done, in either mode.
      e.preventDefault();
      if (key === "y" || e.shiftKey) ws.active.redo();
      else ws.active.undo();
    } else if (ctrl && key === "s") {
      // Everything saves on its own, but Ctrl+S is a reflex: it is respected.
      e.preventDefault();
      void ws.active.flushSave(true);
    }
  });

  // Saves when switching windows, in case the app closes right after.
  const flushAll = () => void saveEverything();
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("blur", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushAll();
  });
}

// The panes and how they are laid out: up to four documents side by side,
// with draggable dividers between the columns, and what is remembered of them
// (which documents were open, where) to find them as they were.

import { t } from "../core/i18n";
import { Pane } from "../page/pane";
import { readWorkspace, rememberWorkspace } from "../core/place";
import { currentSky } from "../space/sky";
import type { DocumentSummary } from "../core/storage";
import { inkColor } from "../space/themes";
import { convertToFile, newAttempt, newDocument, openIn, setNoteMeta } from "./documents";
import { shapeSelected } from "../drawing/drawtools";
import { renderList } from "./explorer";
import { deepen } from "../ideas/rootsmap";
import { lockSpace } from "../space/session";
import { renderSheet } from "../page/sheets";
import { app, inkSettings, isVisible, liveProjects, panesEl, setStatus, ws } from "./state";
import { setBoxTool, syncToolbar } from "../page/toolbar";

/** Neither pane can get narrower than this. */
const MIN_COLUMN = 0.18;
/** Up to four documents at once, by dragging them from the list onto the page. */
const MAX_PANES = 4;

/** The width of each pane column, from 0 to 1. */
let columnRatios: number[] = [1];

/** Set when a pane has just saved: its "Saved" status fades on its own. */
let justSaved = false;

const paneEvents = {
  activate: (pane: Pane) => activate(pane),
  saved: (summary: DocumentSummary) => {
    ws.summaries = [summary, ...ws.summaries.filter((s) => s.id !== summary.id)];
    // The text changed: the next search reads it again.
    ws.searchIndex = null;
    renderList();
    // Attempts show titles: they are updated.
    for (const pane of ws.panes) pane.idea.renderAttempts();
    justSaved = true;
  },
  status: (text: string) => {
    setStatus(text, justSaved);
    justSaved = false;
  },
  locked: () => void lockSpace(),
  resolveColor: (color: string) => inkColor(color, currentSky()),
  summaries: () => ws.summaries.filter(isVisible),
  open: (pane: Pane, id: string) => void openIn(pane, id),
  newAttempt: (pane: Pane) => void newAttempt(pane),
  convertToFile: (pane: Pane) => void convertToFile(pane),
  deepen: (pane: Pane, text: string) => void deepen(pane, text),
  boxPlaced: () => setBoxTool(false),
  noteMeta: (pane: Pane, meta: { label?: string; color?: string }) => {
    if (pane.document) void setNoteMeta(pane.document.id, meta);
  },
  sheetChanged: (pane: Pane) => {
    if (pane === ws.active) renderSheet();
  },
};

/** Opens what was open last time, as it was. If there is nothing to
 *  remember, opens the most recent document. */
export async function restoreWorkspace(): Promise<void> {
  const saved = readWorkspace();
  const living = new Set(ws.summaries.filter((s) => isVisible(s) && !s.released).map((s) => s.id));
  const open = (saved?.open ?? []).filter((id) => living.has(id));
  if (saved) app.classList.toggle("sidebar-hidden", saved.sidebarHidden);
  if (open.length === 0) {
    const first = ws.summaries.find((s) => isVisible(s) && !s.released);
    if (first) await openIn(ws.active, first.id);
    else await newDocument("file", liveProjects()[0]?.id ?? null);
    return;
  }
  await openIn(ws.active, open[0]);
  for (const id of open.slice(1, MAX_PANES)) {
    const pane = addPane();
    layout();
    await openIn(pane, id);
  }
  if (saved?.ratios?.length === columnsFor(ws.panes.length).length) columnRatios = saved.ratios;
  layout();
  activate(ws.panes[Math.min(saved?.active ?? 0, ws.panes.length - 1)]);
  ws.active.focus();
}

/** Remembers what was open, to come back to it next time. */
export function saveWorkspace(): void {
  if (document.body.classList.contains("locked")) return;
  const open = openIds();
  if (!open.length) return;
  rememberWorkspace({
    open,
    active: Math.max(0, ws.panes.indexOf(ws.active)),
    ratios: columnRatios,
    sidebarHidden: app.classList.contains("sidebar-hidden"),
  });
}

// ---------- Panes ----------

export function addPane(): Pane {
  const pane = new Pane(paneEvents);
  Object.assign(pane.ink, inkSettings);
  pane.ink.onSelect = (shape) => {
    if (pane === ws.active) shapeSelected(shape);
  };
  // A new pane arrives in the mode of the others.
  if (ws.active?.mode === "draw") pane.setMode("draw", false);

  ws.panes.push(pane);
  return pane;
}

export function activate(pane: Pane): void {
  if (ws.active === pane) return;
  if (ws.active?.boxTool) setBoxTool(false);
  ws.active = pane;
  updateDepth();
  for (const p of ws.panes) p.root.classList.toggle("active", p === pane);
  syncToolbar();
  renderList();
}

/** How panes are arranged in columns: one, two or three side by side; four, in two by two. */
function columnsFor(count: number): number[][] {
  if (count === 4) return [
    [0, 2],
    [1, 3],
  ];
  return Array.from({ length: count }, (_, i) => [i]);
}

/** Places the panes in columns, with a draggable divider between them. */
export function layout(): void {
  const columns = columnsFor(ws.panes.length);
  if (columnRatios.length !== columns.length) columnRatios = columns.map(() => 1 / columns.length);
  const split = ws.panes.length > 1;
  app.classList.toggle("split", split);
  const children: HTMLElement[] = [];
  columns.forEach((indexes, column) => {
    if (column > 0) children.push(divider(column - 1));
    const element = document.createElement("div");
    element.className = "pane-column";
    element.style.flex = `${columnRatios[column]} 1 0`;
    element.append(...indexes.map((i) => ws.panes[i].root));
    children.push(element);
  });
  panesEl.replaceChildren(...children);
  for (const pane of ws.panes) {
    pane.root.classList.toggle("active", pane === ws.active);
    pane.root.querySelector(".pane-close")?.remove();
    if (split) pane.root.appendChild(closeButton(pane));
  }
  syncToolbar();
}

/** The divider between column `left` and the next one: drag it; double-click evens them out. */
function divider(left: number): HTMLElement {
  const handle = document.createElement("div");
  handle.className = "divider-handle";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", t("main.resizeDivider"));
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const rect = panesEl.getBoundingClientRect();
    const before = columnRatios.slice(0, left).reduce((a, b) => a + b, 0);
    const pair = columnRatios[left] + columnRatios[left + 1];
    const at = (e.clientX - rect.left) / rect.width - before;
    const first = Math.min(pair - MIN_COLUMN, Math.max(MIN_COLUMN, at));
    columnRatios[left] = first;
    columnRatios[left + 1] = pair - first;
    const columns = panesEl.querySelectorAll<HTMLElement>(".pane-column");
    columns[left].style.flex = `${first} 1 0`;
    columns[left + 1].style.flex = `${pair - first} 1 0`;
  });
  const stop = (e: PointerEvent) => {
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    handle.classList.remove("dragging");
    saveWorkspace();
  };
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
  handle.addEventListener("dblclick", () => {
    columnRatios = columnRatios.map(() => 1 / columnRatios.length);
    layout();
    saveWorkspace();
  });
  return handle;
}

function closeButton(pane: Pane): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "pane-close icon-button";
  button.setAttribute("aria-label", t("main.closeSide"));
  button.dataset.hint = t("main.closeSide");
  button.dataset.hintSide = "left";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>';
  button.addEventListener("click", () => void closePane(pane));
  return button;
}

/** Opens a document in a new pane, next to `beside`. */
async function openBeside(id: string, beside: Pane): Promise<void> {
  if (isOpen(id)) {
    activate(paneShowing(id)!);
    return;
  }
  if (ws.panes.length >= MAX_PANES) {
    await openIn(beside, id);
    return;
  }
  const pane = new Pane(paneEvents);
  Object.assign(pane.ink, inkSettings);

  ws.panes.splice(ws.panes.indexOf(beside) + 1, 0, pane);
  columnRatios = [];
  layout();
  await openIn(pane, id);
  saveWorkspace();
}

export async function closePane(pane: Pane): Promise<void> {
  if (ws.panes.length < 2) return;
  await pane.flushSave();
  pane.dispose();
  ws.panes = ws.panes.filter((p) => p !== pane);
  if (ws.active === pane) ws.active = ws.panes[0];
  columnRatios = [];
  layout();
  renderList();
  updateDepth();
  ws.active.focus();
}

/** Dragging a document from the list onto a page opens it beside it (up to four).
 *  With four open, it replaces the one on the page where it is dropped. */
export function setupPaneDrop(): void {
  const hint = document.createElement("div");
  hint.className = "drop-hint";
  const target = (e: DragEvent) => (e.target as Element | null)?.closest<HTMLElement>(".pane");
  const clear = () => {
    hint.remove();
    for (const pane of ws.panes) pane.root.classList.remove("drop-target");
  };
  panesEl.addEventListener(
    "dragover",
    (e) => {
      if (!ws.dragging) return;
      e.preventDefault();
      e.stopPropagation();
      const element = target(e);
      if (!element) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (!element.classList.contains("drop-target")) {
        clear();
        element.classList.add("drop-target");
        hint.textContent = ws.panes.length >= MAX_PANES ? t("main.dropHere") : t("main.dropBeside");
        element.appendChild(hint);
      }
    },
    { capture: true },
  );
  panesEl.addEventListener("dragleave", (e) => {
    if (!panesEl.contains(e.relatedTarget as Node | null)) clear();
  });
  panesEl.addEventListener(
    "drop",
    (e) => {
      if (!ws.dragging) return;
      e.preventDefault();
      e.stopPropagation();
      const id = ws.dragging;
      ws.dragging = null;
      const element = target(e);
      clear();
      const pane = ws.panes.find((p) => p.root === element) ?? ws.active;
      void openBeside(id, pane);
    },
    { capture: true },
  );
  document.addEventListener("dragend", clear);
}

export function paneShowing(id: string): Pane | undefined {
  return ws.panes.find((pane) => pane.document?.id === id);
}

export function isOpen(id: string): boolean {
  return Boolean(paneShowing(id));
}

export function openIds(): string[] {
  return ws.panes.flatMap((pane) => (pane.document ? [pane.document.id] : []));
}

// ---------- Roots ----------

/** The roots a document grows from, from the highest to the closest. */
export function ancestors(id: string): DocumentSummary[] {
  const byId = new Map(ws.summaries.map((s) => [s.id, s]));
  const chain: DocumentSummary[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parent ?? null;
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const root = byId.get(current)!;
    chain.unshift(root);
    current = root.parent;
  }
  return chain;
}

export function depthOf(id: string): number {
  return ancestors(id).length;
}

/** The deeper you are, the deeper the sky looks: a soft veil, like going under water. */
export function updateDepth(): void {
  const depth = ws.active?.document ? depthOf(ws.active.document.id) : 0;
  document.body.style.setProperty("--depth", String(Math.min(depth, 6)));
}

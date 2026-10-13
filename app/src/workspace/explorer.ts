// The sidebar: the activity bar (files, search, trash), the list of files and
// notes of the projects in view, with their roots, and what is done to a
// document right in the list (rename, move, let go, drag).

import { formatDate as formatLocaleDate, t } from "../core/i18n";
import { scoped } from "../core/place";
import type { DocumentSummary } from "../core/storage";
import { swatchCss } from "../drawing/colors";
import { moveDocument, newDocument, openIn, renameDocument, setIdeaState } from "./documents";
import { focusKeys, newProjectRow, projectHeader, projectInput, switcher, switchRow } from "./projects";
import { clearPageHighlights, renderResults, renderSearchWhere, searchInput } from "./searchpanel";
import { $, app, docList, isVisible, liveProjects, panesEl, setStatus, type SideView, ws } from "./state";
import { renderTrash, trashDocument } from "./trash";
import { isOpen, saveWorkspace } from "./workspace";

/** Which projects are expanded in the list. Only ids: nothing readable. */
const EXPANDED_KEY = "ourabox.projects.open";
/** The id used to remember whether "No project" is expanded. */
const LOOSE = "none";

// ---------- The activity bar ----------

/** Like in a code editor: each icon opens its view beside it; touching the one
 *  for the view already showing hides it. The bar always stays at hand. */
export function setupActivityBar(): void {
  const toggle = (view: SideView) => {
    if (!app.classList.contains("sidebar-hidden") && ws.sideView === view) {
      app.classList.add("sidebar-hidden");
      saveWorkspace();
      return;
    }
    showView(view);
  };
  $("view-files").addEventListener("click", () => toggle("files"));
  $("view-search").addEventListener("click", () => toggle("search"));
  $("view-trash").addEventListener("click", () => toggle("trash"));
  $("collapse-all").addEventListener("click", () => {
    // Collapse all: the projects in view stay expanded, only their branches and notes collapse.
    for (const key of [...expanded]) if (!focusKeys().includes(key)) expanded.delete(key);
    saveExpanded();
    renderList();
  });
}

export function showView(view: SideView): void {
  ws.sideView = view;
  if (view !== "search") clearPageHighlights();
  app.classList.remove("sidebar-hidden");
  $("view-files").setAttribute("aria-pressed", String(view === "files"));
  $("view-search").setAttribute("aria-pressed", String(view === "search"));
  $("view-trash").setAttribute("aria-pressed", String(view === "trash"));
  $("side-title").textContent = view === "files" ? t("main.views.files") : view === "search" ? t("main.views.search") : t("main.views.trash");
  document.querySelector<HTMLElement>(".search")!.hidden = view !== "search";
  document.querySelector<HTMLElement>(".side-head .sidebar-actions")!.hidden = view !== "files";
  renderList();
  if (view === "search") {
    searchInput.focus();
    searchInput.select();
  }
  saveWorkspace();
}

// ---------- The list hides on its own ----------

const PIN_KEY = "ourabox.sidebar.pinned";
let sidebarPinned = false;

/** Touching the page hides the list, to leave all the room to the idea.
 *  Whoever prefers to always see it pins it. */
export function setupSidebarPin(): void {
  try {
    sidebarPinned = localStorage.getItem(PIN_KEY) === "on";
  } catch {
    // By default it hides on its own.
  }
  const pin = $("pin-sidebar");
  const render = () => {
    pin.setAttribute("aria-pressed", String(sidebarPinned));
    pin.title = sidebarPinned ? t("main.pinned") : t("main.pin");
  };
  render();
  pin.addEventListener("click", () => {
    sidebarPinned = !sidebarPinned;
    try {
      localStorage.setItem(PIN_KEY, sidebarPinned ? "on" : "off");
    } catch {
      // It holds while the app is open.
    }
    render();
  });
  panesEl.addEventListener(
    "pointerdown",
    () => {
      if (sidebarPinned || app.classList.contains("sidebar-hidden")) return;
      app.classList.add("sidebar-hidden");
      saveWorkspace();
    },
    { capture: true },
  );
}

// ---------- Document list ----------

/** Ideas let go are not deleted: they wait, collapsed, at the end of the list. */
let showReleased = false;

export const ICONS = {
  beside: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M12 4.5v15" /></svg>',
  release: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V7M7 11l5-5 5 5" /><path d="M5 20h14" /></svg>',
  recover: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5" /></svg>',
  rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>',
  updown: '<svg class="updown" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4-4 4 4M8 14l4 4 4-4" /></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12M10 11v6M14 11v6" /></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" /><path d="M13.5 3.5V8.5h5M8.5 13h7M8.5 16.5h5" /></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5A1.5 1.5 0 0 1 7 3.5h10A1.5 1.5 0 0 1 18.5 5v9.5l-6 6H7A1.5 1.5 0 0 1 5.5 19z" /><path d="M18.5 14.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5" /></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>',
};

export const expanded = new Set<string>(readExpanded());

export function readExpanded(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scoped(EXPANDED_KEY)) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveExpanded(): void {
  try {
    localStorage.setItem(scoped(EXPANDED_KEY), JSON.stringify([...expanded]));
  } catch {
    // Without storage: projects expand again on opening.
  }
}

/** Expands a document's project when it opens, so you can see where it is. */
export function expand(project: string | null): void {
  const key = project ?? LOOSE;
  if (expanded.has(key)) return;
  expanded.add(key);
  saveExpanded();
}

export function renderList(): void {
  renderSearchWhere();
  if (ws.sideView === "search") {
    if (ws.searchQuery.trim()) renderResults();
    else {
      const hint = document.createElement("li");
      hint.className = "search-message";
      hint.textContent = t("main.search.hint");
      setList(hint);
    }
    saveWorkspace();
    return;
  }
  if (ws.sideView === "trash") {
    renderTrash();
    saveWorkspace();
    return;
  }
  const visible = ws.summaries.filter(isVisible);
  const living = visible.filter((s) => !s.released);
  const released = visible.filter((s) => s.released);
  const items: HTMLLIElement[] = [];

  // One project at a time: the others wait in the switcher. Others can be added
  // to the view, to get inspired or to move two forward at once.
  const keys = focusKeys();
  if (keys.length || ws.editing) items.push(switcher(keys));
  else {
    const hint = document.createElement("li");
    hint.className = "search-message";
    hint.textContent = t("main.list.emptyProject");
    items.push(hint);
  }
  if (ws.switcherOpen || (ws.editing && ws.editing.id === null && !liveProjects().length)) {
    for (const project of liveProjects()) {
      const count = living.filter((s) => s.project === project.id).length;
      items.push(ws.editing?.id === project.id ? projectInput(project) : switchRow(project, count, keys));
    }
    items.push(ws.editing && ws.editing.id === null ? projectInput(null) : newProjectRow());
  }
  for (const key of keys) {
    const docs = living.filter((s) => s.project === key);
    const project = ws.projects.find((p) => p.id === key) ?? null;
    if (keys.length > 1) {
      items.push(projectHeader(project, docs.length, true));
      if (!expanded.has(key)) continue;
    }
    items.push(...groups(docs, key, keys.length > 1 ? 1 : 0));
  }

  if (released.length) {
    const toggleItem = document.createElement("li");
    const toggle = document.createElement("button");
    toggle.className = "released-toggle";
    toggle.setAttribute("aria-expanded", String(showReleased));
    toggle.textContent = t("main.list.released", { count: released.length });
    toggle.addEventListener("click", () => {
      showReleased = !showReleased;
      renderList();
    });
    toggleItem.appendChild(toggle);
    items.push(toggleItem);
    if (showReleased) items.push(...released.filter((s) => keys.includes(s.project ?? "")).map((summary) => listItem(summary, 0)));
  }
  setList(...items);
  saveWorkspace();
  const input = docList.querySelector<HTMLInputElement>(".project-input input");
  if (input && document.activeElement !== input) {
    input.focus();
    input.select();
  }
}

/** Files and notes, apart. Each group has its own "+". Notes come collapsed,
 *  in chronological order, with a dot on the ones not yet opened. */
function groups(docs: DocumentSummary[], project: string, depth: number): HTMLLIElement[] {
  const items: HTMLLIElement[] = [];
  const here = new Set(docs.map((s) => s.id));
  for (const kind of ["file", "note"] as const) {
    const ofKind = docs.filter((s) => s.kind === kind);
    const item = document.createElement("li");
    item.className = "group-item";
    item.style.setProperty("--level", String(depth));
    const notesKey = `notes:${project}`;
    if (kind === "note") {
      const toggle = document.createElement("button");
      toggle.className = "group-toggle";
      toggle.setAttribute("aria-expanded", String(expanded.has(notesKey)));
      const unread = ofKind.filter((s) => s.unread).length;
      toggle.innerHTML = ICONS.chevron;
      const label = document.createElement("span");
      label.textContent = ofKind.length ? t("main.list.notesCount", { count: ofKind.length }) : t("main.list.notes");
      toggle.appendChild(label);
      if (unread) {
        const dot = document.createElement("span");
        dot.className = "unread-dot";
        dot.title = t("main.list.unread", { count: unread });
        toggle.appendChild(dot);
      }
      toggle.addEventListener("click", () => {
        if (expanded.has(notesKey)) expanded.delete(notesKey);
        else expanded.add(notesKey);
        saveExpanded();
        renderList();
      });
      item.appendChild(toggle);
    } else {
      const name = document.createElement("span");
      name.textContent = t("main.list.files");
      item.appendChild(name);
    }
    const add = document.createElement("button");
    add.className = "doc-action";
    const title = kind === "file" ? t("main.list.newFile") : t("main.list.newNote");
    add.title = title;
    add.setAttribute("aria-label", title);
    add.innerHTML = ICONS.add;
    add.addEventListener("click", () => void newDocument(kind, project));
    item.appendChild(add);
    items.push(item);
    if (kind === "note" && !expanded.has(notesKey)) continue;
    // Notes, from newest to oldest.
    const ordered = kind === "note" ? [...ofKind].sort((a, b) => b.createdAt - a.createdAt) : ofKind;
    // Roots go under the document they grew from, as deep as they are.
    const top = ordered.filter((s) => !s.parent || !here.has(s.parent));
    const branch = (summary: DocumentSummary, level: number, seen: Set<string>) => {
      const children = docs.filter((c) => c.parent === summary.id && !seen.has(c.id));
      items.push(listItem(summary, level, children.length));
      if (!children.length || !expanded.has(summary.id)) return;
      for (const child of children) branch(child, level + 1, new Set([...seen, child.id]));
    };
    for (const summary of top) branch(summary, depth, new Set([summary.id]));
  }
  return items;
}

/** Where a document can go: the other projects. */
function showMoveMenu(item: HTMLLIElement, summary: DocumentSummary): void {
  const menu = document.createElement("div");
  menu.className = "doc-confirm move-menu";
  const label = document.createElement("span");
  label.textContent = t("main.moveTo");
  menu.appendChild(label);
  const destinations: Array<[string, string]> = liveProjects().map((p) => [p.id, p.name]);
  for (const [id, name] of destinations) {
    if (id === summary.project) continue;
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", () => void moveDocument(summary.id, id));
    menu.appendChild(button);
  }
  const cancel = document.createElement("button");
  cancel.textContent = t("common.cancel");
  cancel.className = "muted";
  cancel.addEventListener("click", () => renderList());
  menu.appendChild(cancel);
  item.replaceChildren(menu);
  cancel.focus();
}

function listItem(summary: DocumentSummary, depth: number, children = 0): HTMLLIElement {
  const name = summary.title || (summary.kind === "note" ? t("main.doc.untitledNote") : t("main.doc.untitledDoc"));
  const item = document.createElement("li");
  item.className = "doc-item";
  item.style.setProperty("--level", String(depth));
  item.classList.toggle("active", summary.id === ws.active?.document?.id);
  item.classList.toggle("open", isOpen(summary.id));
  item.classList.toggle("released", summary.released);
  item.classList.toggle("note", summary.kind === "note");

  const open = document.createElement("button");
  open.className = "doc-open";
  const title = document.createElement("span");
  title.className = "doc-title";
  title.textContent = summary.title || t("common.untitled");
  const date = document.createElement("span");
  date.className = "doc-date";
  // Only the title: the line below shows up when it says something useful.
  date.textContent = summary.root ? t("main.doc.attempt") : "";
  if (summary.kind === "note") {
    // Notes show their color, their label and whether they have not been opened yet.
    if (summary.color) {
      const dot = document.createElement("span");
      dot.className = "note-color";
      dot.style.setProperty("--swatch", swatchCss(summary.color));
      title.prepend(dot);
    }
    if (summary.label) {
      const label = document.createElement("span");
      label.className = "note-label";
      label.textContent = summary.label;
      date.append(label);
    }
    item.classList.toggle("unread", summary.unread);
  }
  const icon = document.createElement("span");
  icon.className = "doc-icon";
  icon.innerHTML = summary.kind === "note" ? ICONS.note : ICONS.file;
  open.append(icon, title);
  if (isOpen(summary.id) && summary.id !== ws.active?.document?.id) {
    // A real element, not a drawn dot, so it can say what it means: to a
    // screen reader, and in a tooltip to whoever rests the mouse on it.
    const dot = document.createElement("span");
    dot.className = "open-dot";
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", t("main.doc.openElsewhere"));
    dot.title = t("main.doc.openElsewhere");
    open.append(dot);
  }
  if (date.textContent || date.childElementCount) open.append(date);
  open.title = formatDate(summary.kind === "note" ? summary.createdAt : summary.updatedAt);
  open.addEventListener("click", () => void openIn(ws.active, summary.id));
  if (children) {
    // A document with roots expands like a folder.
    const toggle = document.createElement("button");
    toggle.className = "branch-toggle";
    toggle.setAttribute("aria-expanded", String(expanded.has(summary.id)));
    toggle.title = t("main.doc.roots", { count: children });
    toggle.setAttribute("aria-label", t("main.doc.rootsOf", { name }));
    toggle.innerHTML = ICONS.chevron;
    toggle.addEventListener("click", () => {
      if (expanded.has(summary.id)) expanded.delete(summary.id);
      else expanded.add(summary.id);
      saveExpanded();
      renderList();
    });
    item.classList.add("has-branch");
    item.appendChild(toggle);
  }

  const actions = document.createElement("span");
  actions.className = "doc-actions";
  const action = (icon: string, label: string, run: () => void, danger = false) => {
    const button = document.createElement("button");
    button.className = danger ? "doc-action danger" : "doc-action";
    button.title = label;
    button.setAttribute("aria-label", t("main.actionOn", { action: label, name }));
    button.innerHTML = icon;
    button.addEventListener("click", run);
    actions.appendChild(button);
  };
  if (summary.released) {
    action(ICONS.recover, t("common.restore"), () => void setIdeaState(summary.id, { released: false }));
    action(ICONS.trash, t("common.moveToTrash"), () => void trashDocument(summary.id), true);
  } else {
    action(ICONS.rename, t("common.rename"), () => startRename(item, summary));
    if (liveProjects().length > 1) action(ICONS.move, t("main.doc.move"), () => showMoveMenu(item, summary));
    action(ICONS.release, t("main.doc.release"), () => void setIdeaState(summary.id, { released: true }));
    action(ICONS.trash, t("common.moveToTrash"), () => void trashDocument(summary.id), true);
    // It can also be dragged onto a project.
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
      ws.dragging = summary.id;
      e.dataTransfer?.setData("text/plain", name);
      // It can be moved to a project or opened beside (copied into the view).
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => {
      ws.dragging = null;
      item.classList.remove("dragging");
      for (const target of docList.querySelectorAll(".drop")) target.classList.remove("drop");
    });
  }
  item.append(open, actions);
  // How many actions show on hover: the title leaves them room (see documents.css).
  item.style.setProperty("--actions", String(actions.childElementCount));
  // If the list was redrawn while renaming (because of a save), the name stays half typed.
  if (renaming?.id === summary.id) startRename(item, summary);
  return item;
}

// ---------- Rename ----------

/** While the list is being redrawn: a field that is removed is not taken as finished. */
let redrawingList = false;

export function setList(...items: Node[]): void {
  redrawingList = true;
  try {
    docList.replaceChildren(...items);
  } finally {
    redrawingList = false;
  }
}

/** The document being renamed and what has been typed so far. */
let renaming: { id: string; draft: string } | null = null;

/** The name of a file or note is typed right in the list. Empty, it takes the
 *  title from the first line again. */
function startRename(item: HTMLLIElement, summary: DocumentSummary): void {
  const resumed = renaming?.id === summary.id;
  if (!resumed) renaming = { id: summary.id, draft: summary.title };
  const input = document.createElement("input");
  input.className = "rename-input";
  input.maxLength = 120;
  input.value = renaming!.draft;
  input.placeholder = t("main.rename.placeholder");
  input.setAttribute("aria-label", t("main.rename.label"));
  const wrap = document.createElement("div");
  wrap.className = "rename-row";
  wrap.style.setProperty("--level", item.style.getPropertyValue("--level") || "0");
  wrap.appendChild(input);
  item.replaceChildren(wrap);
  item.draggable = false;
  // When redrawn, focus comes back after the row is in the list.
  const focus = () => {
    if (!input.isConnected) return;
    input.focus();
    if (resumed) input.setSelectionRange(input.value.length, input.value.length);
    else input.select();
  };
  if (item.isConnected) focus();
  else window.setTimeout(focus);
  let done = false;
  input.addEventListener("input", () => {
    if (renaming?.id === summary.id) renaming.draft = input.value;
  });
  const finish = async (save: boolean) => {
    if (done) return;
    done = true;
    renaming = null;
    const name = input.value.trim();
    if (save && name !== summary.title) {
      try {
        await renameDocument(summary.id, name);
      } catch (error) {
        setStatus(t("main.rename.failed"));
        console.error(error);
      }
    }
    renderList();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void finish(true);
    else if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      void finish(false);
    }
  });
  // If the row was removed because the list was redrawn, it doesn't mean it is finished.
  input.addEventListener("blur", () => {
    if (input.isConnected && !redrawingList) void finish(true);
  });
}

/** A short date for the list: the time if it is today, otherwise the day and month. */
export function formatDate(millis: number): string {
  const date = new Date(millis);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatLocaleDate(date, { hour: "2-digit", minute: "2-digit" });
  }
  return formatLocaleDate(date, { day: "numeric", month: "short" });
}

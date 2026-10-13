// Projects: the switcher (one project in view at a time, or a few), creating
// and renaming them right in the list, and the welcome that starts the first one.

import { t } from "../core/i18n";
import { scoped } from "../core/place";
import { type Project, storage } from "../core/storage";
import { currentProject, moveDocument, newDocument } from "./documents";
import { expanded, ICONS, renderList, saveExpanded, showView } from "./explorer";
import { $, app, liveProjects, setStatus, ws } from "./state";
import { trashProject } from "./trash";

// ---------- Starting a project ----------

export function showWelcome(): void {
  const welcome = $("welcome");
  welcome.hidden = false;
  app.classList.add("welcoming");
  $("welcome-trash").hidden = !ws.projects.some((p) => p.trashedAt) && !ws.summaries.some((s) => s.trashedAt);
  renderList();
  window.setTimeout(() => $<HTMLInputElement>("welcome-name").focus(), 50);
}

export function hideWelcome(): void {
  $("welcome").hidden = true;
  app.classList.remove("welcoming");
}

export function setupWelcome(): void {
  const input = $<HTMLInputElement>("welcome-name");
  const start = async () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    try {
      const project = await storage.createProject(name);
      ws.projects.push(project);
      focusOn(project.id);
      input.value = "";
      hideWelcome();
      await newDocument("file", project.id);
    } catch (error) {
      setStatus(t("main.projects.createFailed"));
      console.error(error);
    }
  };
  $("welcome-start").addEventListener("click", () => void start());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void start();
  });
  $("welcome-trash").addEventListener("click", () => showView("trash"));
}

// ---------- One project at a time ----------

const FOCUS_KEY = "ourabox.projects.focus";
ws.focused = readFocus();

export function readFocus(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(scoped(FOCUS_KEY)) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveFocus(): void {
  try {
    localStorage.setItem(scoped(FOCUS_KEY), JSON.stringify(ws.focused));
  } catch {
    // On reopening, the open document's project is shown.
  }
}

/** The projects in view: the chosen ones that still exist, or the open document's. */
export function focusKeys(): string[] {
  const valid = new Set(liveProjects().map((p) => p.id));
  const keys = ws.focused.filter((k) => valid.has(k));
  if (keys.length) return keys;
  const fallback = currentProject() ?? liveProjects()[0]?.id;
  return fallback ? [fallback] : [];
}

/** Shows a project: only that one, or next to the ones already in view. */
function focusOn(project: string, add = false): void {
  const key = project;
  const keys = focusKeys();
  ws.focused = add ? (keys.includes(key) ? keys : [...keys, key]) : [key];
  saveFocus();
  expanded.add(key);
  saveExpanded();
}

function hideFromFocus(key: string): void {
  ws.focused = focusKeys().filter((k) => k !== key);
  saveFocus();
  renderList();
}

/** Opening a document from another project brings that project into view. */
export function followProject(project: string | null): void {
  const keys = focusKeys();
  if (!project || keys.includes(project)) return;
  focusOn(project, keys.length > 1);
}

export function projectName(key: string): string {
  return ws.projects.find((p) => p.id === key)?.name ?? t("common.project");
}

/** The project switcher: shows the one in view; touching it shows the others. */
export function switcher(keys: string[]): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "switcher-item";
  const button = document.createElement("button");
  button.className = "switcher";
  button.setAttribute("aria-expanded", String(ws.switcherOpen));
  button.setAttribute("aria-label", t("main.projects.choose"));
  const name = document.createElement("span");
  name.className = "switcher-name";
  name.textContent = keys.length === 1 ? projectName(keys[0]) : t("main.projects.inView", { count: keys.length });
  button.innerHTML = ICONS.folder;
  button.appendChild(name);
  button.insertAdjacentHTML("beforeend", ICONS.updown);
  button.addEventListener("click", () => {
    ws.switcherOpen = !ws.switcherOpen;
    if (!ws.switcherOpen) ws.editing = null;
    renderList();
  });
  item.appendChild(button);
  return item;
}

/** A project in the switcher: touching it shows it alone; "+" adds it to the view. */
export function switchRow(project: Project, count: number, keys: string[]): HTMLLIElement {
  const shown = keys.includes(project.id);
  const item = document.createElement("li");
  item.className = "switch-row";
  item.classList.toggle("shown", shown);
  const open = document.createElement("button");
  open.className = "switch-open";
  const name = document.createElement("span");
  name.className = "project-name";
  name.textContent = project.name;
  const counter = document.createElement("span");
  counter.className = "project-count";
  counter.textContent = String(count);
  open.append(name, counter);
  open.addEventListener("click", () => {
    focusOn(project.id);
    ws.switcherOpen = false;
    renderList();
  });
  item.appendChild(open);
  const actions = projectActions(project, shown ? null : () => {
    focusOn(project.id, true);
    renderList();
  });
  item.appendChild(actions);
  // The name leaves room for the actions on hover (see documents.css).
  item.style.setProperty("--actions", String(actions.childElementCount));
  makeDropTarget(item, project.id);
  return item;
}

/** A project's actions: also show, rename and move to the trash. */
function projectActions(project: Project, alsoShow: (() => void) | null): HTMLElement {
  const actions = document.createElement("span");
  actions.className = "doc-actions";
  const action = (icon: string, label: string, run: () => void, danger = false) => {
    const button = document.createElement("button");
    button.className = danger ? "doc-action danger" : "doc-action";
    button.title = label;
    button.setAttribute("aria-label", t("main.actionOn", { action: label, name: project.name }));
    button.innerHTML = icon;
    button.addEventListener("click", run);
    actions.appendChild(button);
  };
  if (alsoShow) action(ICONS.add, t("main.projects.alsoShow"), alsoShow);
  action(ICONS.rename, t("common.rename"), () => {
    ws.editing = { id: project.id, draft: project.name };
    renderList();
  });
  action(ICONS.trash, t("common.moveToTrash"), () => void trashProject(project.id), true);
  return actions;
}

export function newProjectRow(): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "switch-row new";
  const button = document.createElement("button");
  button.className = "switch-open";
  button.innerHTML = ICONS.add;
  button.append(document.createTextNode(t("main.projects.new")));
  button.addEventListener("click", () => newProject());
  item.appendChild(button);
  return item;
}

/** Dropping a document on a project moves it there. */
function makeDropTarget(item: HTMLLIElement, project: string): void {
  item.addEventListener("dragover", (e) => {
    if (!ws.dragging) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    item.classList.add("drop");
  });
  item.addEventListener("dragleave", () => item.classList.remove("drop"));
  item.addEventListener("drop", (e) => {
    e.preventDefault();
    item.classList.remove("drop");
    const id = ws.dragging;
    ws.dragging = null;
    if (id) void moveDocument(id, project);
  });
}

/** A project's header (with several in view): it expands, gets renamed and
 *  receives the documents dragged onto it. */
export function projectHeader(project: Project | null, count: number, hideable = false): HTMLLIElement {
  const key = project?.id ?? "";
  const item = document.createElement("li");
  item.className = "project-item";
  item.classList.toggle("current", key === currentProject());

  const toggle = document.createElement("button");
  toggle.className = "project-toggle";
  toggle.setAttribute("aria-expanded", String(expanded.has(key)));
  const name = document.createElement("span");
  name.className = "project-name";
  name.textContent = project?.name ?? t("common.project");
  const counter = document.createElement("span");
  counter.className = "project-count";
  counter.textContent = String(count);
  toggle.innerHTML = ICONS.chevron;
  toggle.append(name, counter);
  toggle.addEventListener("click", () => {
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    saveExpanded();
    renderList();
  });
  item.appendChild(toggle);
  const actions = project ? projectActions(project, null) : null;
  if (actions) item.appendChild(actions);
  if (hideable) {
    const hide = document.createElement("button");
    hide.className = "doc-action project-hide";
    hide.title = t("main.projects.hide");
    hide.setAttribute("aria-label", t("main.projects.hideLabel", { name: project?.name ?? t("common.project") }));
    hide.innerHTML = ICONS.eyeOff;
    hide.addEventListener("click", () => hideFromFocus(key));
    // With the other actions, so they never sit on top of each other.
    if (actions) actions.appendChild(hide);
    else item.appendChild(hide);
  }
  // The name leaves room for the actions on hover (see documents.css).
  if (actions) item.style.setProperty("--actions", String(actions.childElementCount));
  if (project) makeDropTarget(item, project.id);
  return item;
}

/** The name of a new project, or of one being renamed, right in the list. */
export function projectInput(project: Project | null): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "project-input";
  const input = document.createElement("input");
  input.maxLength = 60;
  input.placeholder = t("main.projects.namePlaceholder");
  input.setAttribute("aria-label", t("main.projects.namePlaceholder"));
  input.value = ws.editing?.draft ?? project?.name ?? "";
  // If the list is redrawn while typing, the text is not lost.
  input.addEventListener("input", () => {
    if (ws.editing) ws.editing.draft = input.value;
  });
  let done = false;
  const finish = async (save: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    ws.editing = null;
    try {
      if (save && name && project) {
        const renamed = await storage.renameProject(project.id, name);
        ws.projects = ws.projects.map((p) => (p.id === renamed.id ? renamed : p));
      } else if (save && name) {
        const created = await storage.createProject(name);
        ws.projects.push(created);
        focusOn(created.id);
        ws.switcherOpen = false;
      }
    } catch (error) {
      setStatus(t("main.projects.saveFailed"));
      console.error(error);
    }
    renderList();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void finish(true);
    else if (e.key === "Escape") {
      e.stopPropagation();
      void finish(false);
    }
  });
  input.addEventListener("blur", () => {
    // If the list was redrawn, the new field carries on the editing: this one does not save.
    window.setTimeout(() => {
      if (input.isConnected) void finish(true);
    });
  });
  item.appendChild(input);
  return item;
}

export function newProject(): void {
  app.classList.remove("sidebar-hidden");
  if (ws.sideView !== "files") showView("files");
  if (ws.projects.length) ws.switcherOpen = true;
  ws.editing = { id: null, draft: "" };
  renderList();
}

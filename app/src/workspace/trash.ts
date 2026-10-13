// The trash: moving documents and projects there, restoring them, deleting
// them forever, and how the trash shows in the sidebar.

import { t } from "../core/i18n";
import { forgetPlace } from "../core/place";
import { type DocumentSummary, type Project, storage } from "../core/storage";
import { newDocument, openIn, vacateHidden } from "./documents";
import { expanded, ICONS, renderList, saveExpanded, setList } from "./explorer";
import { hideWelcome, projectName, saveFocus, showWelcome } from "./projects";
import { isVisible, liveProjects, setStatus, ws } from "./state";
import { paneShowing } from "./workspace";

// ---------- Trash ----------
// Nothing is deleted at once: what is removed goes to the trash, from where it
// is restored or deleted forever.

export async function trashDocument(id: string): Promise<void> {
  const pane = paneShowing(id);
  if (pane) await pane.flushSave();
  const changed = new Map((await storage.trash(id, true)).map((s) => [s.id, s]));
  ws.summaries = ws.summaries.map((s) => changed.get(s.id) ?? s);
  ws.searchIndex = null;
  await vacateHidden();
  renderList();
  setStatus(t("main.trash.moved"));
}

async function restoreDocument(id: string): Promise<void> {
  const summary = ws.summaries.find((s) => s.id === id);
  // If its project is also in the trash, it comes back with it.
  const project = ws.projects.find((p) => p.id === summary?.project);
  if (project?.trashedAt) await restoreProject(project.id);
  const changed = new Map((await storage.trash(id, false)).map((s) => [s.id, s]));
  ws.summaries = ws.summaries.map((s) => changed.get(s.id) ?? s);
  ws.searchIndex = null;
  renderList();
  setStatus(t("main.trash.restored"));
}

export async function trashProject(id: string): Promise<void> {
  for (const pane of ws.panes) if (pane.document?.project === id) await pane.flushSave();
  const project = await storage.trashProject(id, true);
  ws.projects = ws.projects.map((p) => (p.id === id ? project : p));
  ws.focused = ws.focused.filter((k) => k !== id);
  saveFocus();
  ws.switcherOpen = false;
  ws.searchIndex = null;
  await vacateHidden();
  if (!liveProjects().length) showWelcome();
  renderList();
  setStatus(t("main.trash.projectTrashed", { name: project.name }));
}

async function restoreProject(id: string): Promise<void> {
  const project = await storage.trashProject(id, false);
  ws.projects = ws.projects.map((p) => (p.id === id ? project : p));
  ws.searchIndex = null;
  hideWelcome();
  if (!ws.panes.some((pane) => pane.document)) {
    const first = ws.summaries.find((s) => isVisible(s) && !s.released);
    if (first) await openIn(ws.active, first.id);
    else await newDocument("file", project.id);
  }
  renderList();
}

/** Deletes a document from the trash forever, with the roots that went with it. */
async function deleteForever(id: string): Promise<void> {
  const stamp = ws.summaries.find((s) => s.id === id)?.trashedAt ?? 0;
  const branch = [id];
  for (let i = 0; i < branch.length; i++) {
    for (const s of ws.summaries) if (s.parent === branch[i] && s.trashedAt === stamp && !branch.includes(s.id)) branch.push(s.id);
  }
  for (const doc of branch.reverse()) {
    await storage.remove(doc);
    forgetPlace(doc);
  }
  ws.summaries = await storage.list();
  ws.searchIndex = null;
  renderList();
  await vacateHidden();
}

async function deleteProjectForever(id: string): Promise<void> {
  for (const s of ws.summaries) if (s.project === id) forgetPlace(s.id);
  ws.summaries = await storage.deleteProject(id);
  ws.projects = ws.projects.filter((p) => p.id !== id);
  expanded.delete(id);
  saveExpanded();
  ws.searchIndex = null;
  renderList();
  await vacateHidden();
}

/** What the trash shows: projects and single documents (not those that go with their project or their root). */
function trashContents(): { projects: Project[]; documents: DocumentSummary[] } {
  const trashedProjects = ws.projects.filter((p) => p.trashedAt);
  const inTrashedProject = new Set(trashedProjects.map((p) => p.id));
  const documents = ws.summaries.filter((s) => {
    if (!s.trashedAt || inTrashedProject.has(s.project ?? "")) return false;
    // A root that went with its document shows inside it, not apart.
    const parent = ws.summaries.find((p) => p.id === s.parent);
    return !(parent && parent.trashedAt === s.trashedAt);
  });
  return { projects: trashedProjects.sort((a, b) => b.trashedAt - a.trashedAt), documents: documents.sort((a, b) => b.trashedAt - a.trashedAt) };
}

async function emptyTrash(): Promise<void> {
  const contents = trashContents();
  for (const project of contents.projects) await deleteProjectForever(project.id);
  for (const document of contents.documents) await deleteForever(document.id);
  setStatus(t("main.trash.emptied"));
}

// ---------- The trash, in the sidebar ----------

export function renderTrash(): void {
  const { projects: trashedProjects, documents } = trashContents();
  const items: HTMLLIElement[] = [];
  const note = document.createElement("li");
  note.className = "search-message";
  note.textContent =
    trashedProjects.length || documents.length
      ? t("main.trash.note")
      : t("main.trash.empty");
  items.push(note);
  const row = (icon: string, title: string, meta: string, restore: () => Promise<void>, forever: (item: HTMLLIElement) => void) => {
    const item = document.createElement("li");
    item.className = "doc-item trash-item";
    const open = document.createElement("div");
    open.className = "doc-open";
    const glyph = document.createElement("span");
    glyph.className = "doc-icon";
    glyph.innerHTML = icon;
    const name = document.createElement("span");
    name.className = "doc-title";
    name.textContent = title;
    const detail = document.createElement("span");
    detail.className = "doc-date";
    detail.textContent = meta;
    open.append(glyph, name, detail);
    const actions = document.createElement("span");
    actions.className = "doc-actions";
    const button = (iconHtml: string, label: string, run: () => void, danger = false) => {
      const b = document.createElement("button");
      b.className = danger ? "doc-action danger" : "doc-action";
      b.title = label;
      b.setAttribute("aria-label", t("main.actionOn", { action: label, name: title }));
      b.innerHTML = iconHtml;
      b.addEventListener("click", run);
      actions.appendChild(b);
    };
    button(ICONS.recover, t("common.restore"), () => void restore());
    button(ICONS.remove, t("common.deleteForever"), () => forever(item), true);
    item.append(open, actions);
    // The title leaves room for the actions on hover (see documents.css).
    item.style.setProperty("--actions", String(actions.childElementCount));
    return item;
  };
  for (const project of trashedProjects) {
    const count = ws.summaries.filter((s) => s.project === project.id).length;
    items.push(
      row(ICONS.folder, project.name, t("main.trash.documents", { count }), () => restoreProject(project.id), (item) =>
        confirmForever(item, t("main.trash.confirmProject", { name: project.name, count }), () => deleteProjectForever(project.id)),
      ),
    );
  }
  for (const summary of documents) {
    const title = summary.title || t("common.untitled");
    items.push(
      row(summary.kind === "note" ? ICONS.note : ICONS.file, title, projectName(summary.project ?? ""), () => restoreDocument(summary.id), (item) =>
        confirmForever(item, t("main.trash.confirmDocument", { name: title }), () => deleteForever(summary.id)),
      ),
    );
  }
  if (trashedProjects.length || documents.length) {
    const item = document.createElement("li");
    const empty = document.createElement("button");
    empty.className = "empty-trash";
    empty.textContent = t("main.trash.emptyButton");
    empty.addEventListener("click", () => confirmForever(item, t("main.trash.confirmEmpty"), emptyTrash));
    item.appendChild(empty);
    items.push(item);
  }
  setList(...items);
}

/** Asks for confirmation in place, without pop-up windows. */
function confirmForever(item: HTMLLIElement, question: string, run: () => Promise<void>): void {
  const confirm = document.createElement("div");
  confirm.className = "doc-confirm";
  const label = document.createElement("span");
  label.textContent = question;
  const yes = document.createElement("button");
  yes.textContent = t("common.deleteForever");
  yes.className = "danger";
  yes.addEventListener("click", () => void run());
  const no = document.createElement("button");
  no.textContent = t("common.cancel");
  no.addEventListener("click", () => renderList());
  confirm.append(label, yes, no);
  item.replaceChildren(confirm);
  no.focus();
}

// Opening, creating and changing documents: what each change does to the list
// and to the panes showing them. A document is never open twice, so its saves
// never compete.

import { t } from "../core/i18n";
import { type Motion, Pane, titleFromText } from "../page/pane";
import { type DocKind, type DocumentData, type DocumentSummary, storage } from "../core/storage";
import { expand, renderList } from "./explorer";
import { pendingLetter } from "../page/lettering";
import { focusKeys, followProject, showWelcome } from "./projects";
import { renderSheet } from "../page/sheets";
import { isVisible, liveProjects, setStatus, ws } from "./state";
import { setMode } from "../page/toolbar";
import { activate, ancestors, closePane, depthOf, paneShowing, updateDepth } from "./workspace";

/** Opens a document in a pane. If it is already open in the other one, that one becomes active:
 *  a document is never open twice, so its saves never compete. */
export async function openIn(pane: Pane, id: string): Promise<void> {
  // What is in the trash (or in a project in the trash) does not open: it is
  // restored first. That way no path (attempts, roots, ideas that come back) edits it.
  const summary = ws.summaries.find((s) => s.id === id);
  if (!summary || !isVisible(summary)) {
    setStatus(summary ? t("main.inTrash") : t("main.docGone"));
    return;
  }
  const showing = paneShowing(id);
  if (showing) {
    activate(showing);
    showing.focus();
    return;
  }
  await pane.flushSave();
  pendingLetter.clear();
  const document = await storage.load(id);
  // Going down into a root or up from it feels like a movement, not a jump.
  const from = pane.document ? depthOf(pane.document.id) : 0;
  const to = depthOf(id);
  const motion: Motion = !pane.document ? "appear" : to > from ? "down" : to < from ? "up" : "appear";
  if (motion !== "appear") await pane.leave(motion);
  pane.show(document, motion);
  if (pane === ws.active) renderSheet();
  expand(document.project);
  followProject(document.project);
  if (document.unread) void markRead(document.id);
  for (const root of ancestors(id)) expand(root.id);
  activate(pane);
  renderList();
  updateDepth();
  pane.focus();
}

/** A new file or note, in the given project or in the active document's project. */
export async function newDocument(kind: DocKind = "file", project: string | null = projectInView()): Promise<void> {
  // Everything lives in a project: with none, one is started first.
  const home = project ?? liveProjects()[0]?.id ?? null;
  if (!home) {
    showWelcome();
    return;
  }
  await ws.active.flushSave();
  const document = await storage.create({ project: home, kind });
  showNew(ws.active, document);
}

/** The project shown in the explorer, if only one is shown; otherwise the open document's. */
export function projectInView(): string | null {
  const keys = focusKeys();
  if (keys.length === 1) return keys[0];
  return currentProject() ?? keys[0] ?? null;
}

/** The project being worked on: the active document's. */
export function currentProject(): string | null {
  const project = ws.active?.document?.project ?? null;
  return liveProjects().some((p) => p.id === project) ? project : null;
}

function showNew(pane: Pane, document: DocumentData): void {
  ws.summaries.unshift(summaryOf(document));
  expand(document.project);
  pane.show(document);
  if (pane === ws.active) renderSheet();
  activate(pane);
  setMode("write");
  renderList();
  pane.focus();
}

export function summaryOf(d: DocumentData): DocumentSummary {
  return {
    id: d.id,
    title: d.title,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    revision: d.revision,
    root: d.root,
    released: d.released,
    restUntil: d.restUntil,
    project: d.project,
    kind: d.kind,
    parent: d.parent,
    label: d.label,
    color: d.color,
    unread: d.unread,
    trashedAt: d.trashedAt ?? 0,
  };
}

/** Another path toward the same why: keeps the why and the box; the text starts blank. */
export async function newAttempt(pane: Pane): Promise<void> {
  const current = pane.document;
  if (!current) return;
  await pane.flushSave();
  const attempt = await storage.create({ project: current.project, parent: current.parent });
  attempt.root = current.root ?? current.id;
  attempt.purpose = current.purpose;
  attempt.assumptions = structuredClone(current.assumptions);
  const saved = await storage.save(attempt);
  attempt.revision = saved.revision;
  attempt.updatedAt = saved.updatedAt;
  showNew(pane, attempt);
  pane.idea.open("next");
}

/** Lets an idea go, brings it back or lets it rest. Letting go does not delete: the idea moves to the ones let go. */
export async function setIdeaState(id: string, state: { released?: boolean; restUntil?: number }): Promise<void> {
  const pane = paneShowing(id);
  if (pane) await pane.flushSave();
  const summary = await storage.setState(id, state);
  ws.summaries = ws.summaries.map((s) => (s.id === id ? summary : s));
  if (pane?.document) {
    Object.assign(pane.document, { revision: summary.revision, released: summary.released, restUntil: summary.restUntil });
    // An idea let go leaves the page: another one takes its place.
    if (summary.released) await vacate(pane);
  }
  renderList();
}

/** An opened note is no longer pending. */
async function markRead(id: string): Promise<void> {
  try {
    await setNoteMeta(id, { unread: false });
  } catch (error) {
    console.error(error);
  }
}

/** Changes the label, the color or the "unopened" mark of a note, everywhere. */
export async function setNoteMeta(id: string, meta: { label?: string; color?: string; unread?: boolean }): Promise<void> {
  const summary = await storage.setNoteMeta(id, meta);
  ws.summaries = ws.summaries.map((s) => (s.id === id ? summary : s));
  for (const pane of ws.panes) {
    if (pane.document?.id !== id) continue;
    Object.assign(pane.document, { label: summary.label, color: summary.color, unread: summary.unread });
    pane.renderNoteMeta();
  }
  renderList();
}

/** A note that grew becomes a file, with its "About this idea" panel. */
export async function convertToFile(pane: Pane): Promise<void> {
  const current = pane.document;
  if (!current || current.kind === "file") return;
  const summary = await storage.setKind(current.id, "file");
  current.kind = summary.kind;
  ws.summaries = ws.summaries.map((s) => (s.id === summary.id ? summary : s));
  pane.applyKind();
  if (pane === ws.active) renderSheet();
  renderList();
}

/** Moves a document to another project, with all its roots. */
export async function moveDocument(id: string, project: string): Promise<void> {
  const changed = new Map((await storage.move(id, project)).map((s) => [s.id, s]));
  ws.summaries = ws.summaries.map((s) => changed.get(s.id) ?? s);
  for (const pane of ws.panes) {
    const summary = pane.document && changed.get(pane.document.id);
    if (summary && pane.document) Object.assign(pane.document, { project: summary.project, parent: summary.parent });
  }
  expand(project);
  updateDepth();
  renderList();
}

/** When a page's document goes away (let go or to the trash), another one takes its place. */
async function vacate(pane: Pane): Promise<void> {
  if (ws.panes.length > 1) {
    await closePane(pane);
    return;
  }
  const next = ws.summaries.find((s) => isVisible(s) && !s.released && s.id !== pane.document?.id);
  if (next) await openIn(pane, next.id);
  else if (liveProjects().length) await newDocument("file", projectInView());
  else {
    pane.clear();
    renderSheet();
    showWelcome();
  }
}

/** Pages showing something no longer visible (in the trash) give up their place. */
export async function vacateHidden(): Promise<void> {
  for (const pane of [...ws.panes]) {
    const summary = pane.document && ws.summaries.find((s) => s.id === pane.document!.id);
    if (pane.document && (!summary || !isVisible(summary))) await vacate(pane);
  }
}

/** Gives a document the name the person wants; empty, it goes back to the first line. */
export async function renameDocument(id: string, name: string): Promise<void> {
  const pane = paneShowing(id);
  let title = name;
  if (pane?.document) {
    pane.document.named = Boolean(name);
    if (name) pane.document.title = name;
    pane.scheduleSave();
    await pane.flushSave();
    title = pane.document.title;
  } else {
    const document = await storage.load(id);
    document.named = Boolean(name);
    document.title = name || titleFromText(textOfHtml(document.html));
    const saved = await storage.save(document);
    title = saved.title;
    ws.summaries = ws.summaries.map((s) => (s.id === id ? saved : s));
  }
  ws.summaries = ws.summaries.map((s) => (s.id === id ? { ...s, title } : s));
  ws.searchIndex = null;
}

/** The text of a closed document, with a line break between paragraphs (as it looks on the page). */
function textOfHtml(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  for (const block of body.querySelectorAll("p, div, h1, h2, h3, li, tr, br, blockquote")) block.before("\n");
  return body.textContent ?? "";
}

/** "No project" no longer exists: documents that had no project move to a real one, which can be renamed. */
export async function adoptLoose(): Promise<void> {
  const known = new Set(ws.projects.map((p) => p.id));
  const loose = ws.summaries.filter((s) => !s.project || !known.has(s.project));
  if (!loose.length) return;
  const looseIds = new Set(loose.map((s) => s.id));
  try {
    const home = await storage.createProject(t("main.projects.general"));
    ws.projects.push(home);
    // Moving a document takes its roots along: the top ones are enough.
    for (const summary of loose) {
      if (summary.parent && looseIds.has(summary.parent)) continue;
      const changed = new Map((await storage.move(summary.id, home.id)).map((s) => [s.id, s]));
      ws.summaries = ws.summaries.map((s) => changed.get(s.id) ?? s);
    }
  } catch (error) {
    console.error(error);
  }
}

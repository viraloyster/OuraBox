// The state shared by the workspace modules, in one place. Values that change
// live in `ws`, an object, because an imported `let` cannot be reassigned by
// the module that imports it. Also the elements every part uses and the
// status line.

import { loadFavorites } from "../drawing/colors";
import type { Effect, InkTool, Shape } from "../drawing/ink";
import type { Pane } from "../page/pane";
import type { SearchIndex } from "./search";
import type { DocumentSummary, Project } from "../core/storage";

export type SideView = "files" | "search" | "trash";

export const ws = {
  summaries: [] as DocumentSummary[],
  projects: [] as Project[],
  panes: [] as Pane[],
  /** The pane the toolbar acts on: the last one touched. */
  active: undefined as unknown as Pane,
  /** How many times the space was locked: what was requested before locking is dropped when it arrives. */
  lockCount: 0,
  sideView: "files" as SideView,
  /** The project whose name is being typed: a new one or an existing one. */
  editing: null as { id: string | null; draft: string } | null,
  /** The document being dragged toward a project. */
  dragging: null as string | null,
  /** The projects chosen to be in view. */
  focused: [] as string[],
  switcherOpen: false,
  searchQuery: "",
  /** The documents' text, only in memory and only while searching. */
  searchIndex: null as SearchIndex | null,
  /** The pen colors pinned by the person. */
  favorites: loadFavorites(),
};

/** The projects that are not in the trash. */
export function liveProjects(): Project[] {
  return ws.projects.filter((p) => !p.trashedAt);
}

/** What shows in the explorer: not in the trash, nor inside a project that is there. */
export function isVisible(summary: DocumentSummary): boolean {
  if (summary.trashedAt) return false;
  const project = ws.projects.find((p) => p.id === summary.project);
  return Boolean(project && !project.trashedAt);
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const app = $("app");
export const panesEl = $("panes");
export const docList = $<HTMLUListElement>("doc-list");
const statusEl = $("status");

/** The drawing settings are the same in both panes. */
export const inkSettings = {
  tool: "pen" as InkTool,
  color: "ink",
  size: 6,
  opacity: 1,
  streamline: 0,
  shape: null as Shape | null,
  front: false,
  eraserSize: 24,
  eraserOpacity: 1,
  snap: false,
  /** With an effect chosen, the pen blends instead of painting. */
  effect: null as Effect | null,
  effectSize: 32,
  effectStrength: 0.6,
  /** Shapes have their own outline, fill and transparency (see the shapes panel). */
  shapeSize: 4,
  shapeOpacity: 1,
  shapeFill: null as string | null,
  shapeOutline: true,
};

// ---------- Status ----------

let statusTimer = 0;
/** Shows a status message. With `fade`, it goes away on its own (like "Saved"). */
export function setStatus(text: string, fade = false): void {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.toggle("visible", Boolean(text));
  if (fade && text) statusTimer = window.setTimeout(() => statusEl.classList.remove("visible"), 1500);
}

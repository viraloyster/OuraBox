// Back exactly where you were: for each document it remembers how far you
// read, where the cursor was and the zoom; and for the space, which documents
// were open and how the screen was split.
//
// It is kept in the window's local storage. Only ids and numbers: nothing of
// the ideas can be read from it.

const PLACES_KEY = "ourabox.places";
const WORKSPACE_KEY = "ourabox.workspace";
/** With several users on the computer, each one remembers their own: the
 *  keys carry a mark of the session (not the name). */
let scope = "";

export function setUserScope(slot: string | null): void {
  scope = slot ?? "";
}

/** When a user is deleted, what this computer remembered for them goes too
 *  (every key that carries their mark). */
export function forgetUserScope(slot: string): void {
  try {
    const suffix = `:${slot}`;
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) if (key?.startsWith("ourabox.") && key.endsWith(suffix)) localStorage.removeItem(key);
  } catch {
    // Without storage there is nothing to forget.
  }
  if (scope === slot) scope = "";
}

/** This user's key for something remembered on the computer. */
export function scoped(key: string): string {
  return scope ? `${key}:${scope}` : key;
}

/** Only the most recently visited documents are remembered. */
const MAX_PLACES = 300;

export interface Place {
  /** How far was read, in page coordinates (without zoom). */
  scroll: number;
  /** The horizontal scroll, which only exists with zoom. */
  left: number;
  zoom: number;
  /** The cursor, as a number of characters from the start of the text. */
  caret: number | null;
}

export interface Workspace {
  /** The open documents, in order (up to four). */
  open: string[];
  active: number;
  /** The width of each column of panes. */
  ratios?: number[];
  sidebarHidden: boolean;
}

function read<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage: it opens like the first time.
  }
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function readPlace(id: string): Place | null {
  const place = read<Record<string, Place>>(scoped(PLACES_KEY))?.[id];
  if (!place || !isNumber(place.scroll) || !isNumber(place.zoom)) return null;
  return {
    scroll: Math.max(0, place.scroll),
    left: isNumber(place.left) ? Math.max(0, place.left) : 0,
    zoom: place.zoom,
    caret: isNumber(place.caret) ? place.caret : null,
  };
}

export function rememberPlace(id: string, place: Place): void {
  const places = read<Record<string, Place>>(scoped(PLACES_KEY)) ?? {};
  // The most recent goes last, so the oldest are dropped first.
  delete places[id];
  places[id] = place;
  const ids = Object.keys(places);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_PLACES))) delete places[old];
  write(scoped(PLACES_KEY), places);
}

export function forgetPlace(id: string): void {
  const places = read<Record<string, Place>>(scoped(PLACES_KEY));
  if (!places || !(id in places)) return;
  delete places[id];
  write(scoped(PLACES_KEY), places);
}

export function readWorkspace(): Workspace | null {
  const workspace = read<Workspace>(scoped(WORKSPACE_KEY));
  if (!workspace || !Array.isArray(workspace.open)) return null;
  const open = workspace.open.filter((id): id is string => typeof id === "string").slice(0, 4);
  const ratios = Array.isArray(workspace.ratios) && workspace.ratios.every((r) => isNumber(r) && r > 0) ? workspace.ratios : undefined;
  return {
    open,
    active: isNumber(workspace.active) && workspace.active >= 0 && workspace.active < open.length ? workspace.active : 0,
    ratios,
    sidebarHidden: workspace.sidebarHidden === true,
  };
}

export function rememberWorkspace(workspace: Workspace): void {
  write(scoped(WORKSPACE_KEY), workspace);
}

/** The cursor position as a number of characters from the start of `root`. */
export function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
}

/** Puts the cursor `offset` characters from the start of `root` (or at the end, if the text is shorter). */
export function placeCaret(root: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      break;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

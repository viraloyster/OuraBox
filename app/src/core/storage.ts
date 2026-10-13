// Bridge between the interface and the Rust core, which is what encrypts and saves the documents.

import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Stroke } from "../drawing/ink";
import { t, translate } from "./i18n";
import englishErrors from "../locales/en/errors";

/** A file is an idea for deep work; a note, something quick. */
export type DocKind = "file" | "note";

/** The formats something can be exported to, without encryption. */
export type ExportKind = "png" | "md" | "txt" | "html";

/** Bytes to base64, in parts (a large file does not fit in a single call). */
export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A project: a folder that groups files and notes. */
export interface Project {
  id: string;
  name: string;
  createdAt: number;
  /** When it was moved to the Trash (0: it is not there). Its documents go with it. */
  trashedAt: number;
}

/** The readable text of a document, for searching. */
export interface DocumentText {
  id: string;
  text: string;
}

export type AssumptionState = "accept" | "break" | "unknown";

/** An assumption of the idea: something taken for granted. */
export interface Assumption {
  text: string;
  state: AssumptionState;
}

export interface DocumentData {
  id: string;
  title: string;
  html: string;
  strokes: Stroke[];
  createdAt: number;
  updatedAt: number;
  /** How many times it was saved. A save based on an old revision is rejected. */
  revision: number;
  format?: number;
  /** What the person wants to achieve: the why. */
  purpose: string;
  /** A single next step. */
  nextStep: string;
  /** The box: what the idea takes for granted. */
  assumptions: Assumption[];
  /** If it is an attempt at another idea, the id of the first attempt. */
  root: string | null;
  released: boolean;
  /** It is not suggested again before this date (milliseconds). */
  restUntil: number;
  /** The project it belongs to. It changes with `move`, not when saving. */
  project: string | null;
  /** It changes with `setKind`, not when saving. */
  kind: DocKind;
  /** The root it was born from when going deeper. It does not change when saving. */
  parent: string | null;
  /** Free text boxes, anywhere on the page. */
  boxes: TextBox[];
  /** Notes: label, color and whether it is unopened. They change with `setNoteMeta`, not when saving. */
  label: string;
  color: string | null;
  unread: boolean;
  /** When it was moved to the Trash (0: it is not there). It changes with `trash`, not when saving. */
  trashedAt: number;
  /** The person gave it a name: the title no longer comes from the first line. */
  named: boolean;
  /** The page size and how many pages it has (older files may not have it). */
  sheet?: Sheet;
}

/** The size of each page, in pixels at 96 dpi, and how many there are. `pages`
 *  is 0 in files older than this: they are counted by what they contain. */
export interface Sheet {
  width: number;
  height: number;
  pages: number;
  /** Add pages on their own when going past the last one. Off by default. */
  autoPages: boolean;
}

export const DEFAULT_SHEET: Sheet = { width: 816, height: 1056, pages: 0, autoPages: false };

/** A free text box. Position and width in page coordinates;
 *  `scale` is the size of its lettering (1 = normal). */
export interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  scale: number;
  html: string;
  /** The width follows the text (up to a limit) until the person widens the
   *  box by hand. `width` still holds the last width it had, so a box always
   *  has one. Absent in boxes saved before it existed: those keep their width. */
  fit?: boolean;
}

/** The colors notes are marked with: the palette's, which follow the sky. */
export const NOTE_COLORS = ["ink", "agua", "coral", "sol", "alga", "crepusculo"] as const;

/** A root in a project's map. */
export interface MapNode {
  id: string;
  title: string;
  parent: string | null;
  kind: DocKind;
  assumptions: Assumption[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  root: string | null;
  released: boolean;
  restUntil: number;
  project: string | null;
  kind: DocKind;
  parent: string | null;
  label: string;
  color: string | null;
  unread: boolean;
  trashedAt: number;
}

/** A version saved in a document's history. */
export interface Snapshot {
  name: string;
  updatedAt: number;
  revision: number;
}

export interface Asset {
  mime: string;
  /** The bytes in base64. */
  data: string;
}

/** What the door shows: create the first user, give a name to the space from
 *  before users existed, enter, or nothing (already entered). */
export type SpaceState = "new" | "legacy" | "locked" | "unlocked";

export interface SpaceStatus {
  state: SpaceState;
  /** The name used to enter (only while the space is open). */
  user: string | null;
  /** A mark of the session to keep apart what each user remembers on this computer. */
  slot: string | null;
}

export type ErrorCode =
  | "locked"
  | "wrong_password"
  | "invalid_input"
  | "not_found"
  | "corrupted"
  | "conflict"
  | "io"
  | "internal";

/** Errors from the core arrive with a code, a key and a readable message (in English). */
export interface AppError {
  code: ErrorCode;
  message: string;
  /** Stable name of the message, to show it in the person's language (`errors.<key>`). */
  key?: string;
}

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

/** The entry operations: each one with the user. */
export interface Storage extends SpaceStorage {
  status(): Promise<SpaceStatus>;
  /** Creates a user with their space and returns the recovery key, which is shown only once. */
  createVault(user: string, password: string): Promise<string>;
  unlock(user: string, password: string): Promise<void>;
  /** Gives a username to the space from before users existed (with its usual password). */
  claimSpace(user: string, password: string): Promise<void>;
  recover(user: string, code: string, password: string): Promise<void>;
  /** A new user from the chosen backup, with the backup's password or, if
   *  `password` is given, with the recovery key and that new password. */
  restoreCopy(user: string, secret: string, password?: string): Promise<void>;
  /** Deletes the user who entered, with their whole space, after checking their
   *  password. The space ends up locked; the other users keep theirs. */
  deleteUser(password: string): Promise<void>;
}

/** A single space (what the core does with the space of the user who entered). */
interface SpaceStorage {
  lock(): Promise<void>;
  changePassword(current: string, password: string): Promise<void>;
  /** A new recovery key; the previous one stops working. Asks for the current password. */
  newRecoveryCode(password: string): Promise<string>;
  /** Optional: opens the email program with a message to oneself containing the key. */
  openRecoveryMail(to: string, code: string): Promise<void>;
  list(): Promise<DocumentSummary[]>;
  /** With `parent`, the document is born as a root of that one: same project, always a file. */
  create(options?: { project?: string | null; kind?: DocKind; parent?: string | null }): Promise<DocumentData>;
  /** The roots map of a project (null: the documents without a project). */
  map(project: string | null): Promise<MapNode[]>;
  load(id: string): Promise<DocumentData>;
  /** Returns the summary with the new revision. */
  save(document: DocumentData): Promise<DocumentSummary>;
  remove(id: string): Promise<void>;
  /** Let go of an idea or bring it back, or let it rest until a date. */
  setState(id: string, state: { released?: boolean; restUntil?: number }): Promise<DocumentSummary>;
  /** Moves a document with all its roots to a project (or to none), without
   *  changing its revision. Returns the summaries that changed. */
  move(id: string, project: string | null): Promise<DocumentSummary[]>;
  /** A note's label, color (`""` removes it) or "unopened", without changing its revision. */
  setNoteMeta(id: string, meta: { label?: string; color?: string; unread?: boolean }): Promise<DocumentSummary>;
  /** Turns a note into a file or the other way around, without changing its revision. */
  setKind(id: string, kind: DocKind): Promise<DocumentSummary>;
  /** The text of all documents, to search in memory. */
  texts(): Promise<DocumentText[]>;
  projects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<Project>;
  /** Deletes forever a project that is in the Trash, with its documents. Returns the new list. */
  deleteProject(id: string): Promise<DocumentSummary[]>;
  /** Moves a document (with its roots) to the Trash, or restores it. Returns the summaries that changed. */
  trash(id: string, trashed: boolean): Promise<DocumentSummary[]>;
  /** Moves a project to the Trash, or restores it. */
  trashProject(id: string, trashed: boolean): Promise<Project>;
  /** Asks where to save an encrypted backup of the whole space. Returns the file's name, or null if cancelled. */
  exportCopy(name: string): Promise<string | null>;
  /** Saves an export (image or text, unencrypted) wherever the person chooses.
   *  Returns the file's name, or null if cancelled. */
  saveExport(name: string, kind: ExportKind, data: Uint8Array): Promise<string | null>;
  /** Asks to choose a backup to open. Returns its name, or null if cancelled. */
  chooseCopy(): Promise<string | null>;
  history(id: string): Promise<Snapshot[]>;
  loadSnapshot(id: string, name: string): Promise<DocumentData>;
  /** Saves an image separately and returns its id (the fingerprint of its content). */
  putAsset(mime: string, data: string): Promise<string>;
  getAsset(id: string): Promise<Asset>;
}

const tauriStorage: Storage = {
  status: () => invoke("vault_status"),
  createVault: (user, password) => invoke("create_vault", { user, password }),
  unlock: (user, password) => invoke("unlock", { user, password }),
  claimSpace: (user, password) => invoke("claim_space", { user, password }),
  lock: () => invoke("lock"),
  recover: (user, code, password) => invoke("recover", { user, code, password }),
  changePassword: (current, password) => invoke("change_password", { current, password }),
  newRecoveryCode: (password) => invoke("new_recovery_code", { password }),
  deleteUser: (password) => invoke("delete_user", { password }),
  openRecoveryMail: (to, code) =>
    invoke("open_recovery_mail", { to, code, subject: t("dialogs.mailSubject"), body: t("dialogs.mailBody") }),
  list: () => invoke("list_documents"),
  create: (options) =>
    invoke("create_document", { project: options?.project ?? null, kind: options?.kind ?? null, parent: options?.parent ?? null }),
  map: (project) => invoke("project_map", { project }),
  load: (id) => invoke("load_document", { id }),
  save: (document) => invoke("save_document", { document }),
  remove: (id) => invoke("delete_document", { id }),
  setState: (id, state) => invoke("set_document_state", { id, released: state.released, restUntil: state.restUntil }),
  move: (id, project) => invoke("move_document", { id, project }),
  setKind: (id, kind) => invoke("set_document_kind", { id, kind }),
  setNoteMeta: (id, meta) => invoke("set_note_meta", { id, label: meta.label ?? null, color: meta.color ?? null, unread: meta.unread ?? null }),
  texts: () => invoke("search_texts"),
  projects: () => invoke("list_projects"),
  createProject: (name) => invoke("create_project", { name }),
  renameProject: (id, name) => invoke("rename_project", { id, name }),
  deleteProject: (id) => invoke("delete_project", { id }),
  trash: (id, trashed) => invoke("trash_document", { id, trashed }),
  trashProject: (id, trashed) => invoke("trash_project", { id, trashed }),
  exportCopy: (name) => invoke("export_copy", { name, text: { title: t("dialogs.saveCopy"), filter: t("dialogs.copyFilter") } }),
  saveExport: (name, kind, data) =>
    invoke("save_export", {
      name,
      kind,
      data: toBase64(data),
      text: { title: t("dialogs.export"), filter: translate(`dialogs.filters.${kind}`) },
    }),
  chooseCopy: () => invoke("choose_copy", { text: { title: t("dialogs.openCopy"), filter: t("dialogs.copyFilter") } }),
  restoreCopy: (user, secret, password) => invoke("restore_copy", { user, secret, password: password ?? null }),
  history: (id) => invoke("document_history", { id }),
  loadSnapshot: (id, name) => invoke("load_snapshot", { id, name }),
  putAsset: (mime, data) => invoke("put_asset", { mime, data }),
  getAsset: (id) => invoke("get_asset", { id }),
};

const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;

// Only to see the interface in a browser during development (`npm run dev`).
// It saves in the tab's memory: it does not persist, does not encrypt and is not
// secure. The real app encrypts in Rust. This imitates its rules (locking,
// revisions, history and errors, with the same codes, keys and English
// messages) so the interface behaves the same.

/** An error like the core's: the same code, key and English message. */
type ErrorKey = Exclude<keyof typeof englishErrors, "generic">;
function fail(code: ErrorCode, key: ErrorKey): never {
  // The core's errors reach the interface as plain objects, not `Error`: the same here.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw { code, key, message: englishErrors[key] } satisfies AppError;
}

/** A test space, with its password. */
interface PreviewSpace extends SpaceStorage {
  status(): Promise<"new" | "locked" | "unlocked">;
  createVault(password: string): Promise<string>;
  unlock(password: string): Promise<void>;
  recover(code: string, password: string): Promise<void>;
  restoreCopy(secret: string, password?: string): Promise<void>;
  /** Fails like the core when the password is not this space's. */
  checkPassword(password: string): Promise<void>;
}

function previewSpace(): PreviewSpace {
  const documents = new Map<string, DocumentData>();
  const snapshots = new Map<string, Array<{ snapshot: Snapshot; document: DocumentData }>>();
  const assets = new Map<string, Asset>();
  let projects: Project[] = [];
  const summary = (d: DocumentData): DocumentSummary => ({
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
  });
  let password: string | null = null;
  let unlocked = false;
  const requireUnlocked = () => {
    if (!unlocked) fail("locked", "locked");
  };
  const find = (id: string): DocumentData => documents.get(id) ?? fail("not_found", "document_not_found");
  const findProject = (id: string): Project => projects.find((p) => p.id === id) ?? fail("not_found", "project_not_found");
  const projectName = (name: string): string => name.trim().slice(0, 60) || fail("invalid_input", "project_name_required");
  // As in the core: changes data that is not content without touching the revision.
  const updateMeta = (id: string, change: (d: DocumentData) => void): DocumentSummary => {
    const document = find(id);
    change(document);
    return summary(document);
  };
  const save = (document: DocumentData): DocumentSummary => {
    requireUnlocked();
    const saved = documents.get(document.id);
    if (saved && saved.revision !== document.revision) {
      fail("conflict", "document_changed_elsewhere");
    }
    // Like the core: what was deleted forever does not come back through a late save.
    if (!saved && document.revision !== 0) fail("not_found", "document_deleted");
    const next = {
      ...structuredClone(document),
      ...(saved
        ? { project: saved.project, kind: saved.kind, parent: saved.parent, label: saved.label, color: saved.color, unread: saved.unread, trashedAt: saved.trashedAt }
        : {}),
      title: document.title.trim(),
      updatedAt: Math.max(Date.now(), (saved?.updatedAt ?? 0) + 1),
      revision: document.revision + 1,
    };
    documents.set(next.id, next);
    const list = snapshots.get(next.id) ?? [];
    const latest = list[list.length - 1]?.snapshot.updatedAt ?? 0;
    const empty = !next.html.trim() && next.strokes.length === 0;
    if (!empty && next.updatedAt - latest >= SNAPSHOT_EVERY_MS) {
      list.push({ snapshot: { name: `${next.updatedAt}-${next.revision}`, updatedAt: next.updatedAt, revision: next.revision }, document: structuredClone(next) });
      snapshots.set(next.id, list);
    }
    return summary(next);
  };
  return {
    async status() {
      return password === null ? "new" : unlocked ? "unlocked" : "locked";
    },
    async createVault(value) {
      password = value;
      unlocked = true;
      return "PREV-IEWO-NLYN-OTEN-CRYP-TEDX-XXXX-XXXX";
    },
    async unlock(value) {
      if (value !== password) fail("wrong_password", "wrong_password");
      unlocked = true;
    },
    async lock() {
      unlocked = false;
    },
    async recover(_code, value) {
      password = value;
      unlocked = true;
    },
    async changePassword(current, value) {
      if (current !== password) fail("wrong_password", "wrong_password");
      password = value;
    },
    async checkPassword(value) {
      if (value !== password) fail("wrong_password", "wrong_password");
    },
    async newRecoveryCode(value) {
      if (value !== password) fail("wrong_password", "wrong_password");
      return "NEWK-EYFO-RTES-TING-XXXX-XXXX-XXXX-XXXX";
    },
    async openRecoveryMail(to) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) fail("invalid_input", "invalid_email");
    },
    async list() {
      requireUnlocked();
      return [...documents.values()].map(summary).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async create(options) {
      requireUnlocked();
      const parent = options?.parent ? find(options.parent) : null;
      if (parent) options = { project: parent.project, kind: "file", parent: parent.id };
      if (options?.project) findProject(options.project);
      const now = Date.now();
      const document: DocumentData = {
        id: crypto.randomUUID().replace(/-/g, ""),
        title: "",
        html: "",
        strokes: [],
        createdAt: now,
        updatedAt: now,
        revision: 0,
        purpose: "",
        nextStep: "",
        assumptions: [],
        root: null,
        released: false,
        restUntil: 0,
        project: options?.project ?? null,
        kind: options?.kind ?? "file",
        parent: options?.parent ?? null,
        boxes: [],
        label: "",
        color: null,
        unread: false,
        trashedAt: 0,
        named: false,
        sheet: { ...DEFAULT_SHEET, pages: 1 },
      };
      const created = save(document);
      return { ...document, updatedAt: created.updatedAt, revision: created.revision };
    },
    async load(id) {
      requireUnlocked();
      return structuredClone(find(id));
    },
    async save(document) {
      return save(document);
    },
    async remove(id) {
      requireUnlocked();
      documents.delete(id);
      snapshots.delete(id);
      for (const d of documents.values()) if (d.parent === id) d.parent = null;
    },
    async setState(id, state) {
      requireUnlocked();
      const document = structuredClone(find(id));
      if (state.released !== undefined) document.released = state.released;
      if (state.restUntil !== undefined) document.restUntil = state.restUntil;
      return save(document);
    },
    async move(id, project) {
      requireUnlocked();
      if (project) findProject(project);
      const branch: string[] = [];
      const pending = [id];
      while (pending.length) {
        const current = pending.pop()!;
        for (const d of documents.values()) {
          if (d.parent === current && !branch.includes(d.id)) {
            branch.push(d.id);
            pending.push(d.id);
          }
        }
      }
      const changed = [updateMeta(id, (d) => ((d.project = project), (d.parent = null)))];
      for (const child of branch) changed.push(updateMeta(child, (d) => (d.project = project)));
      return changed;
    },
    async map(project) {
      requireUnlocked();
      return [...documents.values()]
        .filter((d) => !d.released && !d.trashedAt && d.project === project)
        .map((d) => ({ id: d.id, title: d.title, parent: d.parent, kind: d.kind, assumptions: structuredClone(d.assumptions) }));
    },
    async setNoteMeta(id, meta) {
      requireUnlocked();
      if (meta.color && !(NOTE_COLORS as readonly string[]).includes(meta.color)) fail("invalid_input", "unknown_color");
      return updateMeta(id, (d) => {
        if (meta.label !== undefined) d.label = meta.label.trim().slice(0, 24);
        if (meta.color !== undefined) d.color = meta.color || null;
        if (meta.unread !== undefined) d.unread = meta.unread;
      });
    },
    async setKind(id, kind) {
      requireUnlocked();
      return updateMeta(id, (d) => (d.kind = kind));
    },
    async texts() {
      requireUnlocked();
      // As in the core: the text of the page and that of "About this idea".
      const plain = (html: string) =>
        new DOMParser().parseFromString(html.replace(/<(p|div|br|li|h1|h2|h3)\b/gi, "\n<$1"), "text/html").body.textContent?.trim() ?? "";
      return [...documents.values()].map((d) => ({
        id: d.id,
        text: [plain(d.html), ...(d.boxes ?? []).map((b) => plain(b.html)), d.label, d.purpose, d.nextStep, ...d.assumptions.map((a) => a.text)]
          .filter((t) => t && t.trim())
          .join("\n"),
      }));
    },
    async projects() {
      requireUnlocked();
      return structuredClone(projects);
    },
    async createProject(name) {
      requireUnlocked();
      const project = { id: crypto.randomUUID().replace(/-/g, ""), name: projectName(name), createdAt: Date.now(), trashedAt: 0 };
      projects.push(project);
      return { ...project };
    },
    async renameProject(id, name) {
      requireUnlocked();
      const project = findProject(id);
      project.name = projectName(name);
      return { ...project };
    },
    async deleteProject(id) {
      requireUnlocked();
      if (!findProject(id).trashedAt) fail("invalid_input", "project_not_in_trash");
      for (const document of [...documents.values()]) {
        if (document.project !== id) continue;
        documents.delete(document.id);
        snapshots.delete(document.id);
      }
      projects = projects.filter((p) => p.id !== id);
      return [...documents.values()].map(summary).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async trash(id, trashed) {
      requireUnlocked();
      const current = find(id).trashedAt ?? 0;
      if (trashed && current !== 0) return [];
      const branch: string[] = [];
      const pending = [id];
      while (pending.length) {
        const at = pending.pop()!;
        for (const d of documents.values()) {
          if (d.parent === at && !branch.includes(d.id)) {
            branch.push(d.id);
            pending.push(d.id);
          }
        }
      }
      const stamp = trashed ? Date.now() : 0;
      const changed = [updateMeta(id, (d) => (d.trashedAt = stamp))];
      for (const child of branch) {
        const childStamp = find(child).trashedAt ?? 0;
        if (trashed ? childStamp === 0 : current !== 0 && childStamp === current) changed.push(updateMeta(child, (d) => (d.trashedAt = stamp)));
      }
      return changed;
    },
    async trashProject(id, trashed) {
      requireUnlocked();
      const project = findProject(id);
      project.trashedAt = trashed ? Date.now() : 0;
      return { ...project };
    },
    async exportCopy(name) {
      requireUnlocked();
      return `${name}.ourabox`;
    },
    async saveExport(name, kind, data) {
      requireUnlocked();
      // In the browser, a normal download.
      const types: Record<ExportKind, string> = { png: "image/png", md: "text/markdown", txt: "text/plain", html: "text/html" };
      const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: types[kind] }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name || "OuraBox"}.${kind}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return link.download;
    },
    async chooseCopy() {
      return fail("invalid_input", "copies_desktop_only");
    },
    async restoreCopy() {
      fail("invalid_input", "copies_desktop_only");
    },
    async history(id) {
      requireUnlocked();
      return (snapshots.get(id) ?? []).map((s) => s.snapshot);
    },
    async loadSnapshot(id, name) {
      requireUnlocked();
      const found = (snapshots.get(id) ?? []).find((s) => s.snapshot.name === name);
      if (!found) fail("not_found", "version_not_found");
      return structuredClone(found.document);
    },
    async putAsset(mime, data) {
      requireUnlocked();
      const bytes = new TextEncoder().encode(data);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const id = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
      assets.set(id, { mime, data });
      return id;
    },
    async getAsset(id) {
      requireUnlocked();
      return assets.get(id) ?? fail("not_found", "image_not_found");
    },
  };
}

// Only to see the interface in a browser during development: several users,
// each with their own test space in memory (see previewSpace).
export function browserPreviewStorage(): Storage {
  const users = new Map<string, PreviewSpace>();
  let active: { name: string; key: string; slot: string; space: PreviewSpace } | null = null;
  const wrong = () => fail("wrong_password", "wrong_username_or_password");
  // Like the core: without extra spaces and ignoring case.
  const name = (user: string): [shown: string, key: string] => {
    const shown = user.split(/\s+/).filter(Boolean).join(" ");
    if (!shown) fail("invalid_input", "username_required");
    if ([...shown].length > 40) fail("invalid_input", "username_too_long");
    if (!/^[\p{L}\p{N} ._-]+$/u.test(shown)) fail("invalid_input", "username_invalid_characters");
    return [shown, shown.toLowerCase()];
  };
  const slotOf = (key: string) => `u${[...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16)}`;
  const enter = (shown: string, key: string, space: PreviewSpace) => (active = { name: shown, key, slot: slotOf(key), space });
  const free = (user: string): [string, string] => {
    const [shown, key] = name(user);
    if (users.has(key)) fail("invalid_input", "username_taken");
    return [shown, key];
  };
  // What does not need a user (choosing a backup) goes to an empty space.
  const loose = previewSpace();
  const auth: Partial<Storage> = {
    async status() {
      return active
        ? { state: "unlocked", user: active.name, slot: active.slot }
        : { state: users.size ? "locked" : "new", user: null, slot: null };
    },
    async createVault(user, password) {
      const [shown, key] = free(user);
      const space = previewSpace();
      const code = await space.createVault(password);
      users.set(key, space);
      enter(shown, key, space);
      return code;
    },
    async unlock(user, password) {
      const [shown, key] = name(user);
      const space = users.get(key) ?? wrong();
      await space.unlock(password).catch(wrong);
      enter(shown, key, space);
    },
    async claimSpace() {
      fail("not_found", "no_legacy_space");
    },
    async lock() {
      await active?.space.lock();
      active = null;
    },
    async deleteUser(password) {
      if (!active) fail("locked", "locked");
      await active.space.checkPassword(password);
      await active.space.lock();
      users.delete(active.key);
      active = null;
    },
    async recover(user, code, password) {
      const [shown, key] = name(user);
      const space = users.get(key) ?? fail("wrong_password", "wrong_username_or_recovery_code");
      await space.recover(code, password);
      enter(shown, key, space);
    },
    async restoreCopy(user, secret, password) {
      const [shown, key] = free(user);
      const space = previewSpace();
      await space.restoreCopy(secret, password);
      users.set(key, space);
      enter(shown, key, space);
    },
  };
  return new Proxy(auth, {
    get(target, property: string) {
      if (property in target) return target[property as keyof Storage];
      return (...args: unknown[]) => {
        const space = (active?.space ?? loose) as unknown as Record<string, (...a: unknown[]) => unknown>;
        return space[property](...args);
      };
    },
  }) as Storage;
}

export const storage: Storage = isTauri() ? tauriStorage : browserPreviewStorage();

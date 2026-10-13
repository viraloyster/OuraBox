// The session: opening the space after the door, locking it, signing out,
// adding or deleting a user, and saving everything before the window goes.

import { clearAssetCache } from "../core/assets";
import { showLock } from "./lock";
import { forgetUserScope, setUserScope } from "../core/place";
import { dismissResurface, maybeResurface, REST_FOR } from "../ideas/resurface";
import { resetAutolock } from "./security";
import { closeSettings } from "./settings";
import { storage } from "../core/storage";
import { adoptLoose, openIn, setIdeaState } from "../workspace/documents";
import { expanded, readExpanded, renderList } from "../workspace/explorer";
import { hideWelcome, readFocus, showWelcome } from "../workspace/projects";
import { closeRootsMap } from "../ideas/rootsmap";
import { clearSearch } from "../workspace/searchpanel";
import { $, isVisible, liveProjects, setStatus, ws } from "../workspace/state";
import { setMode } from "../page/toolbar";
import { layout, openIds, restoreWorkspace, saveWorkspace } from "../workspace/workspace";

/** Called on unlock: loads the list and opens the most recent document. */
export async function openSpace(): Promise<void> {
  resetAutolock();
  // What this device remembers (what is open, what is expanded) belongs to each user.
  const status = await storage.status();
  setUserScope(status.slot);
  currentUser = status.user;
  renderUser();
  expanded.clear();
  for (const id of readExpanded()) expanded.add(id);
  ws.focused = readFocus();
  [ws.summaries, ws.projects] = await Promise.all([storage.list(), storage.projects()]);
  await adoptLoose();
  // With no projects, the first thing is to start one.
  if (!liveProjects().length) {
    showWelcome();
    return;
  }
  hideWelcome();
  await restoreWorkspace();
  maybeResurface(ws.summaries.filter(isVisible), openIds(), {
    resume: (id) => void openIn(ws.active, id),
    rest: (id) => void setIdeaState(id, { restUntil: Date.now() + REST_FOR }),
    release: (id) => void setIdeaState(id, { released: true }),
  });
}

/** Who signed in: shown in the settings. */
let currentUser: string | null = null;

function renderUser(): void {
  $("session-user").textContent = currentUser ?? "";
}

/** Signs out and opens the door to create another user. */
export async function addUser(): Promise<void> {
  await lockSpace("signOut");
  showLock("create", () => void openSpace(), true);
}

/** Deletes the user who entered, with their whole space. Pending saves finish
 *  first, so nothing writes to the space once it is gone. A wrong password
 *  throws and leaves everything as it was. */
export async function deleteUser(password: string): Promise<void> {
  await Promise.all(ws.panes.map((pane) => pane.flushSave()));
  const { slot } = await storage.status();
  try {
    await storage.deleteUser(password);
  } catch (reason) {
    // If it failed halfway, the space is already gone (and closed): the door comes all the same.
    if ((await storage.status()).state === "unlocked") throw reason;
  }
  // What this computer remembered for them (open documents, places) goes too.
  if (slot) forgetUserScope(slot);
  await lockSpace("deleted");
}

/** How the space closes. "lock" keeps who was signed in, like a computer's
 *  lock screen: the door asks only for their password (the name stays in
 *  memory, never saved). "signOut" forgets them. "deleted" follows deleting
 *  the user: nothing is saved, since their space no longer exists. */
type Closing = "lock" | "signOut" | "deleted";

/** Saves, forgets the key and clears everything decrypted from the screen. */
export async function lockSpace(closing: Closing = "lock"): Promise<void> {
  if (document.body.classList.contains("locked")) return;
  ws.lockCount++;
  if (closing !== "deleted") {
    saveWorkspace();
    for (const pane of ws.panes) pane.rememberPlace();
    await Promise.all(ws.panes.map((pane) => pane.flushSave()));
  }
  await storage.lock();
  closeSettings();
  closeRootsMap();
  $("quick-note-panel").hidden = true;
  $<HTMLTextAreaElement>("quick-text").value = "";
  dismissResurface();
  clearAssetCache();
  for (const pane of ws.panes.slice(1)) pane.dispose();
  ws.panes = ws.panes.slice(0, 1);
  ws.active = ws.panes[0];
  ws.active.clear();
  setMode("write");
  layout();
  ws.summaries = [];
  ws.projects = [];
  ws.editing = null;
  clearSearch();
  renderList();
  setStatus("");
  const user = closing === "lock" ? currentUser : null;
  currentUser = null;
  if (closing !== "deleted") {
    showLock(user ? "locked" : "unlock", () => void openSpace(), true, user);
    return;
  }
  // With no users left, the door offers to create one.
  const { state } = await storage.status();
  showLock(state === "new" ? "create" : state === "legacy" ? "claim" : "unlock", () => void openSpace());
}

/** Saves the open documents and where each one was, e.g. before the window reloads. */
export async function saveEverything(): Promise<void> {
  for (const pane of ws.panes) pane.rememberPlace();
  saveWorkspace();
  await Promise.all(ws.panes.map((pane) => pane.flushSave()));
}

// The entry point: starts the workspace (the document list, the toolbar and
// the panes) and connects each part to the page. With split view there are
// several panes; the toolbar always acts on the active pane, the last one touched.
//
// What each part does lives in its own module: the shared state in state.ts,
// the panes in workspace.ts, the list in explorer.ts, the toolbar in toolbar.ts…

import { loadLocale, t, translateCss, translateDom } from "./core/i18n";
import { setupLanguageChoices, setupLanguageSelect } from "./core/language";
import { loadFonts } from "./core/fonts";
import { installSizeStyles } from "./page/format";
import { showLock } from "./space/lock";
import { setupSecurity, startAutolock } from "./space/security";
import { setupSettings } from "./space/settings";
import { setupSky } from "./space/sky";
import { storage } from "./core/storage";
import { setupHints } from "./core/hints";
import { renderColors } from "./drawing/colorpanel";
import { setupSidebarPin } from "./workspace/explorer";
import { setupWelcome } from "./workspace/projects";
import { setupQuickNote } from "./workspace/quicknote";
import { setupRootsMap } from "./ideas/rootsmap";
import { setupSearch } from "./workspace/searchpanel";
import { addUser, deleteUser, lockSpace, openSpace, saveEverything } from "./space/session";
import { setupShortcuts } from "./workspace/shortcuts";
import { $, setStatus, ws } from "./workspace/state";
import { setupToolbar, steadyToolbar } from "./page/toolbar";
import { addPane, layout, setupPaneDrop } from "./workspace/workspace";

// ---------- Start ----------

async function init(): Promise<void> {
  await loadLocale();
  translateDom();
  translateCss();
  loadFonts();
  installSizeStyles();
  ws.active = addPane();
  layout();
  setupSky(() => {
    ws.panes.forEach((pane) => pane.ink.recolor());
    if ($("favorites").childElementCount) renderColors();
  });
  setupToolbar();
  setupHints();
  void steadyToolbar();
  setupSearch();
  setupPaneDrop();
  setupSidebarPin();
  setupQuickNote();
  setupWelcome();
  setupRootsMap();
  setupShortcuts();
  setupSecurity(deleteUser);
  setupSettings(() => void lockSpace(), () => void lockSpace("signOut"));
  setupLanguageChoices($("language-choices"), saveEverything);
  setupLanguageSelect($("lock-language"));
  $("add-user").addEventListener("click", () => void addUser());
  $("lock-space").addEventListener("click", () => void lockSpace());
  startAutolock(() => void lockSpace());
  const status = await storage.status();
  if (status.state === "unlocked") await openSpace();
  else showLock(status.state === "new" ? "create" : status.state === "legacy" ? "claim" : "unlock", () => void openSpace());
}

void init().catch((error) => {
  setStatus(t("main.openFailed"));
  console.error(error);
});

// The entry point: starts the workspace (the document list, the toolbar and
// the panes) and connects each part to the page. With split view there are
// several panes; the toolbar always acts on the active pane, the last one touched.
//
// What each part does lives in its own module: the shared state in state.ts,
// the panes in workspace.ts, the list in explorer.ts, the toolbar in toolbar.ts…

import { loadLocale, t, translateCss, translateDom } from "./i18n";
import { setupLanguageChoices, setupLanguageSelect } from "./language";
import { loadFonts } from "./fonts";
import { installSizeStyles } from "./format";
import { showLock } from "./lock";
import { setupSecurity, startAutolock } from "./security";
import { setupSettings } from "./settings";
import { setupSky } from "./sky";
import { storage } from "./storage";
import { setupHints } from "./hints";
import { renderColors } from "./colorpanel";
import { setupSidebarPin } from "./explorer";
import { setupWelcome } from "./projects";
import { setupQuickNote } from "./quicknote";
import { setupRootsMap } from "./rootsmap";
import { setupSearch } from "./searchpanel";
import { addUser, deleteUser, lockSpace, openSpace, saveEverything } from "./session";
import { setupShortcuts } from "./shortcuts";
import { $, setStatus, ws } from "./state";
import { setupToolbar, steadyToolbar } from "./toolbar";
import { addPane, layout, setupPaneDrop } from "./workspace";

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

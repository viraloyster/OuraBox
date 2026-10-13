// Roots: going deeper from a sentence into a new document under it, and the
// map of a project's roots, drawn by roots.ts.

import { t } from "./i18n";
import { Pane } from "./pane";
import { renderMap } from "./roots";
import { settingsOpen } from "./settings";
import { storage } from "./storage";
import { currentProject, openIn, summaryOf } from "./documents";
import { expand } from "./explorer";
import { $, app, setStatus, ws } from "./state";

// ---------- Roots map ----------

export function setupRootsMap(): void {
  $("open-roots").addEventListener("click", () => void openRootsMap());
  $("close-roots").addEventListener("click", closeRootsMap);
  $("roots").addEventListener("click", (e) => {
    if (e.target === $("roots")) closeRootsMap();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("roots").hidden) {
      // Escape closes the map and nothing else (it does not change mode).
      e.preventDefault();
      closeRootsMap();
    }
  });
}

/** The map of the active document's project (or of the documents with no project). */
async function openRootsMap(): Promise<void> {
  await ws.active.flushSave();
  const project = currentProject();
  const name = ws.projects.find((p) => p.id === project)?.name ?? t("main.roots.noProject");
  $("roots-title").textContent = t("main.roots.title", { name });
  $("roots").hidden = false;
  // While the map is open, what is behind it does not get focus.
  app.inert = true;
  try {
    renderMap($("roots-map"), name, await storage.map(project), ws.active.document?.id ?? null, (id) => {
      closeRootsMap();
      void openIn(ws.active, id);
    });
  } catch (error) {
    setStatus(t("main.roots.mapFailed"));
    console.error(error);
  }
}

export function closeRootsMap(): void {
  if ($("roots").hidden) return;
  $("roots").hidden = true;
  if (!settingsOpen()) app.inert = false;
  // Decrypted content does not stay on the screen.
  $("roots-map").replaceChildren();
}

/** Go deeper: the chosen sentence becomes a new root, under the document, and you go down into it. */
export async function deepen(pane: Pane, text: string): Promise<void> {
  const current = pane.document;
  if (!current) return;
  try {
    const child = await storage.create({ parent: current.id });
    const heading = document.createElement("h1");
    heading.textContent = text;
    child.html = `${heading.outerHTML}<p><br></p>`;
    child.title = text;
    const saved = await storage.save(child);
    child.revision = saved.revision;
    child.updatedAt = saved.updatedAt;
    ws.summaries.unshift(summaryOf(child));
    pane.markRoot(child.id);
    await pane.flushSave();
    expand(current.id);
    await openIn(pane, child.id);
    pane.caretToEnd();
  } catch (error) {
    setStatus(t("main.roots.createFailed"));
    console.error(error);
  }
}

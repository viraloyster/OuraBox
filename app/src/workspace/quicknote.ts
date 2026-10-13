// The quick note: an idea written down and sent to a project, without leaving
// what you were doing.

import { t } from "../core/i18n";
import { titleFromText } from "../page/pane";
import { storage } from "../core/storage";
import { currentProject } from "./documents";
import { renderList } from "./explorer";
import { projectName, showWelcome } from "./projects";
import { $, liveProjects, setStatus, ws } from "./state";

// ---------- Quick note ----------

/** An idea that arrives in the middle of another: write it down, choose which
 *  project it goes to and send it, without leaving what you were doing. */
export function setupQuickNote(): void {
  const panel = $("quick-note-panel");
  const text = $<HTMLTextAreaElement>("quick-text");
  const destination = $<HTMLSelectElement>("quick-dest");
  const button = $("quick-note");
  const close = () => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    const current = currentProject();
    const options: Array<[string, string]> = liveProjects().map((p): [string, string] => [p.id, p.name]);
    destination.replaceChildren(
      ...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
    destination.value = current ?? options[0]?.[0] ?? "";
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    text.focus();
  };
  button.addEventListener("click", () => (panel.hidden ? open() : close()));
  const send = async () => {
    const value = text.value.trim();
    if (!value) {
      text.focus();
      return;
    }
    const project = destination.value || null;
    if (!project) {
      close();
      showWelcome();
      return;
    }
    const sendButton = $<HTMLButtonElement>("quick-send");
    sendButton.disabled = true;
    try {
      const note = await storage.create({ project, kind: "note" });
      note.html = value
        .split("\n")
        .map((line) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = line;
          if (!line) paragraph.appendChild(document.createElement("br"));
          return paragraph.outerHTML;
        })
        .join("");
      note.title = titleFromText(value);
      const saved = await storage.save(note);
      note.revision = saved.revision;
      // It stays pending, with a dot, until it is opened.
      const summary = await storage.setNoteMeta(note.id, { unread: true });
      ws.summaries = [summary, ...ws.summaries.filter((s) => s.id !== summary.id)];
      ws.searchIndex = null;
      text.value = "";
      close();
      renderList();
      setStatus(t("main.quickNote.sent", { project: projectName(project) }));
    } catch (error) {
      setStatus(t("main.quickNote.failed"));
      console.error(error);
    } finally {
      sendButton.disabled = false;
    }
  };
  $("quick-send").addEventListener("click", () => void send());
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !button.contains(e.target as Node)) close();
  });
}

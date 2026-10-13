// The search view in the sidebar: across the projects (with the index from
// search.ts, only in memory and only while searching) or in the open pages.

import { t } from "../core/i18n";
import { findInElement } from "../page/findinpage";
import { Pane } from "../page/pane";
import { buildIndex, type Highlight, search } from "./search";
import { type DocumentSummary, storage } from "../core/storage";
import { openIn } from "./documents";
import { formatDate, renderList, setList, showView } from "./explorer";
import { $, isVisible, liveProjects, setStatus, ws } from "./state";
import { activate } from "./workspace";

// ---------- Search ----------

export const searchInput = $<HTMLInputElement>("search-input");
const searchWhere = $<HTMLSelectElement>("search-where");
const searchWhat = $<HTMLSelectElement>("search-what");

let searchLoading: Promise<void> | null = null;

export function setupSearch(): void {
  searchInput.addEventListener("focus", () => void loadSearchIndex());
  searchInput.addEventListener("input", () => {
    ws.searchQuery = searchInput.value;
    $("search-clear").hidden = !ws.searchQuery;
    void loadSearchIndex().then(renderList);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    // Esc clears the search; with nothing typed, it goes back to the explorer.
    if (ws.searchQuery) clearSearch();
    else showView("files");
    renderList();
  });
  for (const select of [searchWhere, searchWhat]) {
    select.addEventListener("change", () => {
      renderList();
      searchInput.focus();
    });
  }
  $("search-clear").addEventListener("click", () => {
    clearSearch();
    renderList();
    searchInput.focus();
  });
}

/** Reads the text of every document once per search. It is forgotten on save and on lock. */
function loadSearchIndex(): Promise<void> {
  if (ws.searchIndex) return Promise.resolve();
  const session = ws.lockCount;
  searchLoading ??= storage
    .texts()
    .then((texts) => {
      // If the space was locked meanwhile, the decrypted text does not stay in memory.
      if (session !== ws.lockCount || document.body.classList.contains("locked")) return;
      const titles = new Map(ws.summaries.map((s) => [s.id, s.title]));
      ws.searchIndex = buildIndex(
        texts.map((entry) => {
          const title = titles.get(entry.id) ?? "";
          // The title is the first line of the text: it is not repeated in the snippet.
          const [first, ...rest] = entry.text.split("\n");
          const text = title && first.trim().startsWith(title) ? rest.join("\n") : entry.text;
          return { id: entry.id, title, text };
        }),
      );
    })
    .catch((error) => {
      setStatus(t("main.search.failed"));
      console.error(error);
    })
    .finally(() => (searchLoading = null));
  return searchLoading;
}

export function clearSearch(): void {
  ws.searchQuery = "";
  searchInput.value = "";
  ws.searchIndex = null;
  clearPageHighlights();
  $("search-clear").hidden = true;
}

/** "Where to search": all projects, one of them, or what is open. */
export function renderSearchWhere(): void {
  const current = searchWhere.value || "all";
  const options: Array<[string, string]> = [["all", ws.projects.length ? t("main.search.allProjects") : t("main.search.everywhere")]];
  // What is open: with a single file, that one; with several, all together ("in
  // the window") or a chosen one, each by its name.
  const open = openPanes();
  if (open.length > 1) {
    options.push(["window", t("main.search.inWindow", { count: open.length })]);
    for (const pane of open) options.push([`pane:${pane.document!.id}`, t("main.search.onlyIn", { title: shortTitle(pane.document!.title) })]);
  } else {
    options.push(["window", t("main.search.inOpenPage")]);
  }
  for (const project of liveProjects()) options.push([project.id, t("main.search.inProject", { name: project.name })]);
  searchWhere.replaceChildren(
    ...options.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  // If the chosen file was closed, the search covers what is still open.
  searchWhere.value = options.some(([value]) => value === current) ? current : current.startsWith("pane:") ? "window" : "all";

}

export function renderResults(): void {
  const items: HTMLLIElement[] = [];
  const message = (text: string) => {
    const item = document.createElement("li");
    item.className = "search-message";
    item.textContent = text;
    items.push(item);
  };
  clearPageHighlights();
  const inPages = searchWhere.value === "window" || searchWhere.value.startsWith("pane:");
  searchWhat.hidden = inPages;
  if (inPages) {
    const id = searchWhere.value.startsWith("pane:") ? searchWhere.value.slice(5) : null;
    items.push(...pageResults(message, openPanes().filter((pane) => !id || pane.document?.id === id)));
  } else if (!ws.searchIndex) {
    message(t("main.search.searching"));
  } else {
    const where = searchWhere.value;
    // Never what is in the trash.
    const ids = new Set(ws.summaries.filter((s) => isVisible(s) && (where === "all" || s.project === where)).map((s) => s.id));
    const results = search(ws.searchIndex, ws.searchQuery, { titlesOnly: searchWhat.value === "title", ids });
    const byId = new Map(ws.summaries.map((s) => [s.id, s]));
    for (const result of results) {
      const summary = byId.get(result.id);
      if (summary) items.push(resultItem(summary, result.titleMatches, result.snippet, result.snippetMatches));
    }
    if (!items.length) message(t("main.search.nothing"));
  }
  setList(...items);
}

function resultItem(summary: DocumentSummary, titleMatches: Highlight[], snippet: string, snippetMatches: Highlight[]): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "doc-item result-item";
  item.classList.toggle("active", summary.id === ws.active?.document?.id);
  const open = document.createElement("button");
  open.className = "doc-open";
  const title = document.createElement("span");
  title.className = "doc-title";
  title.append(...highlighted(summary.title || t("common.untitled"), summary.title ? titleMatches : []));
  const meta = document.createElement("span");
  meta.className = "doc-date";
  const project = ws.projects.find((p) => p.id === summary.project)?.name;
  meta.textContent = [project, summary.kind === "note" ? t("main.search.note") : "", summary.released ? t("main.search.released") : "", formatDate(summary.updatedAt)]
    .filter(Boolean)
    .join(" · ");
  open.append(title, meta);
  if (snippet.trim() && searchWhat.value !== "title") {
    const text = document.createElement("span");
    text.className = "result-snippet";
    text.append(...highlighted(snippet, snippetMatches));
    open.appendChild(text);
  }
  open.addEventListener("click", () => void openIn(ws.active, summary.id));
  item.appendChild(open);
  return item;
}

// ---------- Search in the open files ----------

const PAGE_HIGHLIGHT = "ourabox-find";

/** The panes with a document open, in order. */
function openPanes(): Pane[] {
  return ws.panes.filter((pane) => pane.document);
}

function shortTitle(title: string): string {
  const text = title.trim() || t("common.untitled");
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

/** Each occurrence in the open files (or in one): touching it goes to it, in
 *  its pane, and selects it. */
function pageResults(message: (text: string) => void, where: Pane[]): HTMLLIElement[] {
  const found = where.map((pane) => ({ pane, matches: findInElement(pane.editorElement, ws.searchQuery) }));
  const total = found.reduce((sum, f) => sum + f.matches.length, 0);
  const several = where.length > 1;
  if (!total) {
    message(several ? t("main.search.notInOpenFiles") : t("main.search.notInPage"));
    return [];
  }
  message(several ? t("main.search.timesInOpenFiles", { count: total }) : t("main.search.timesInPage", { count: total }));
  // All of them are marked on the pages, if the system allows it.
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightClass = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (registry && HighlightClass) registry.set(PAGE_HIGHLIGHT, new HighlightClass(...found.flatMap((f) => f.matches.map((m) => m.range))));
  const items: HTMLLIElement[] = [];
  for (const { pane, matches } of found) {
    if (!matches.length) continue;
    if (several) {
      // With several open, each group carries the name of its file.
      const head = document.createElement("li");
      head.className = "search-message page-group";
      head.textContent = `${shortTitle(pane.document?.title ?? "")} · ${matches.length}`;
      items.push(head);
    }
    for (const match of matches) {
      const item = document.createElement("li");
      item.className = "doc-item result-item page-result";
      const open = document.createElement("button");
      open.className = "doc-open";
      const text = document.createElement("span");
      text.className = "result-snippet";
      text.append(...highlighted(match.snippet, [{ start: match.start, end: match.end }]));
      open.appendChild(text);
      open.addEventListener("click", () => {
        activate(pane);
        const editor = pane.editorElement;
        editor.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(match.range);
        const target = match.range.startContainer.parentElement;
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      item.appendChild(open);
      items.push(item);
    }
  }
  return items;
}

export function clearPageHighlights(): void {
  (globalThis.CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete(PAGE_HIGHLIGHT);
}

/** The text with the matches marked. Built with nodes, never with HTML. */
function highlighted(text: string, matches: Highlight[]): Node[] {
  const nodes: Node[] = [];
  let at = 0;
  for (const match of matches) {
    if (match.start < at) continue;
    nodes.push(document.createTextNode(text.slice(at, match.start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(match.start, match.end);
    nodes.push(mark);
    at = match.end;
  }
  nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}

// Pages: adding, duplicating or removing the page in view, and its size. Only in files.

import { t } from "../core/i18n";
import { Pane } from "./pane";
import { $, ws } from "../workspace/state";

// ---------- Pages ----------

/** Common sizes, in pixels at 96 dpi (portrait). `id` is only used inside the panel. */
const SHEET_SIZES: Array<{ id: string; width: number; height: number }> = [
  { id: "letter", width: 816, height: 1056 },
  { id: "A4", width: 794, height: 1123 },
  { id: "legal", width: 816, height: 1344 },
  { id: "square", width: 1080, height: 1080 },
  { id: "16:9", width: 1280, height: 720 },
];

/** The name shown for a page size. */
function sheetSizeName(id: string): string {
  switch (id) {
    case "letter":
      return t("main.sheet.letter");
    case "legal":
      return t("main.sheet.legal");
    case "square":
      return t("main.sheet.square");
    default:
      return id;
  }
}
const PX_PER_CM = 96 / 2.54;
/** Removing a page with something on it asks for a second touch. */
let removeArmed: { pane: Pane; index: number; at: number } | null = null;

/** Pages: add, duplicate or remove the one in view, and its size. Only in files. */
export function setupSheet(): void {
  const button = $("sheet-button");
  button.addEventListener("click", () => {
    removeArmed = null;
    renderSheet();
  });
  for (const action of document.querySelectorAll<HTMLButtonElement>("#sheet-panel [data-sheet]")) {
    action.addEventListener("click", () => {
      const index = ws.active.currentSheet();
      switch (action.dataset.sheet) {
        case "add":
          ws.active.addSheet(index);
          ws.active.scrollToSheet(index + 1);
          break;
        case "duplicate":
          ws.active.duplicateSheet(index);
          ws.active.scrollToSheet(index + 1);
          break;
        case "remove":
          // The second touch has to be on the same page, right away.
          const armed = removeArmed && removeArmed.pane === ws.active && removeArmed.index === index && Date.now() - removeArmed.at < 4000;
          if (ws.active.sheetHasContent(index) && !armed) {
            removeArmed = { pane: ws.active, index, at: Date.now() };
            action.querySelector("span")!.textContent = t("main.sheet.confirmRemove", { number: index + 1 });
            action.classList.add("armed");
            return;
          }
          removeArmed = null;
          ws.active.removeSheet(index);
          break;
      }
      renderSheet();
      // After taking the view to the new page, the panel says where you are.
      window.setTimeout(renderSheet, 500);
    });
  }
  const sizes = SHEET_SIZES.map((size) => {
    const option = document.createElement("button");
    option.type = "button";
    option.setAttribute("role", "radio");
    option.dataset.sheetSize = size.id;
    option.innerHTML = `<span class="sheet-shape" style="aspect-ratio: ${size.width} / ${size.height}"></span>`;
    option.append(sheetSizeName(size.id));
    option.addEventListener("click", () => {
      const landscape = ws.active.sheet.width > ws.active.sheet.height && size.width !== size.height;
      const [w, h] = size.width === size.height || size.width > size.height ? [size.width, size.height] : landscape ? [size.height, size.width] : [size.width, size.height];
      ws.active.setSheetSize(w, h);
      renderSheet();
    });
    return option;
  });
  $("sheet-sizes").replaceChildren(...sizes);
  for (const turn of document.querySelectorAll<HTMLElement>("#sheet-panel [data-turn]")) {
    turn.addEventListener("click", () => {
      const { width, height } = ws.active.sheet;
      const landscape = turn.dataset.turn === "landscape";
      if (landscape !== width > height && width !== height) ws.active.setSheetSize(height, width);
      renderSheet();
    });
  }
  for (const id of ["sheet-width", "sheet-height"]) {
    const input = $<HTMLInputElement>(id);
    input.addEventListener("change", () => {
      const cm = Number(input.value.replace(",", "."));
      // An empty or zero box does not shrink the page: it goes back to what it had.
      if (!input.value.trim() || !Number.isFinite(cm) || cm <= 0) return renderSheet();
      const px = Math.min(4000, Math.max(200, Math.round(cm * PX_PER_CM)));
      const { width, height } = ws.active.sheet;
      ws.active.setSheetSize(id === "sheet-width" ? px : width, id === "sheet-height" ? px : height);
      renderSheet();
    });
  }
  const auto = $<HTMLInputElement>("auto-pages");
  auto.addEventListener("change", () => ws.active.setAutoPages(auto.checked));
}

/** The pages button is only in files; its panel says which page you are on. */
export function renderSheet(): void {
  const file = ws.active?.document?.kind === "file";
  $("sheet-button").hidden = !file;
  if (!file) {
    $("sheet-panel").hidden = true;
    return;
  }
  const pages = ws.active.pageCount();
  const index = ws.active.currentSheet();
  $("sheet-where").textContent = pages === 1 ? t("main.sheet.one") : t("main.sheet.where", { number: index + 1, total: pages });
  const remove = $("sheet-panel").querySelector<HTMLButtonElement>('[data-sheet="remove"]')!;
  remove.disabled = pages <= 1;
  if (!removeArmed || removeArmed.pane !== ws.active || removeArmed.index !== index) {
    removeArmed = null;
    remove.classList.remove("armed");
    remove.querySelector("span")!.textContent = t("main.sheet.remove");
  }
  const { width, height, autoPages } = ws.active.sheet;
  for (const option of document.querySelectorAll<HTMLElement>("#sheet-sizes [data-sheet-size]")) {
    const size = SHEET_SIZES.find((s) => s.id === option.dataset.sheetSize)!;
    const on = (size.width === width && size.height === height) || (size.width === height && size.height === width);
    option.setAttribute("aria-checked", String(on));
  }
  for (const turn of document.querySelectorAll<HTMLElement>("#sheet-panel [data-turn]")) {
    turn.setAttribute("aria-checked", String((turn.dataset.turn === "landscape") === width > height));
    (turn as HTMLButtonElement).disabled = width === height;
  }
  const cm = (px: number) => (Math.round((px / PX_PER_CM) * 10) / 10).toString();
  for (const [id, px] of [["sheet-width", width], ["sheet-height", height]] as const) {
    const input = $<HTMLInputElement>(id);
    if (document.activeElement !== input) input.value = cm(px);
  }
  $<HTMLInputElement>("auto-pages").checked = autoPages;
}

// Simple tables inside the page, with calculations.
//
// - A cell that starts with "=" is a formula (see tablemath.ts). It shows its
//   result; entering the cell shows the formula so it can be edited.
// - Tab moves to the next cell (and in the last one adds a row), like in any
//   spreadsheet.
// - When the cursor is in a table a small bar appears: add or remove rows and
//   columns, fill a series and add up the columns.

import { t } from "../core/i18n";
import { isFormula } from "../core/sanitize";
import { columnName, computeTable, continueSeries, shiftFormula } from "./tablemath";

const ICON = {
  addRow: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="9" rx="2" /><path d="M12 16v5M9.5 18.5h5" /></svg>',
  addColumn: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="9" height="16" rx="2" /><path d="M16 12h5M18.5 9.5v5" /></svg>',
  removeRow: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="9" rx="2" /><path d="M9.5 18.5h5" /></svg>',
  removeColumn: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="9" height="16" rx="2" /><path d="M16.5 12h4" /></svg>',
  series: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h3M6 10h5M6 15h7" /><path d="M17 8v11M14 16l3 3 3-3" /></svg>',
  sum: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5H7l6 7-6 7h10" /></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>',
};

const cellsOf = (row: HTMLTableRowElement) => [...row.cells] as HTMLTableCellElement[];

export class TableTools {
  private bar: HTMLElement;
  /** The cell where the cursor is, and whether it showed a formula on entering. */
  private cell: HTMLTableCellElement | null = null;

  constructor(
    private editor: HTMLElement,
    private page: HTMLElement,
    signal: AbortSignal,
    private zoom: () => number,
    private onChange: () => void,
  ) {
    this.bar = document.createElement("div");
    this.bar.className = "table-bar glass";
    this.bar.hidden = true;
    this.bar.setAttribute("role", "toolbar");
    this.bar.setAttribute("aria-label", t("table.toolbar"));
    const action = (icon: string, label: string, run: () => void) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = icon;
      button.setAttribute("aria-label", label);
      button.dataset.hint = label;
      button.dataset.hintSide = "left";
      // The button does not take the cursor away from the cell.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", () => {
        // The cell being edited saves its formula before rows or columns move.
        const editing = this.cell;
        const table = this.table();
        if (editing?.isConnected) this.leave(editing);
        run();
        if (this.cell?.isConnected) this.enter(this.cell);
        // The calculations are redone even if the cursor left the table (when removing a row).
        if (table?.isConnected) this.recomputeTable(table, this.cell);
        this.onChange();
        this.place();
      });
      this.bar.appendChild(button);
    };
    action(ICON.addRow, t("table.addRow"), () => this.addRow());
    action(ICON.addColumn, t("table.addColumn"), () => this.addColumn());
    action(ICON.removeRow, t("table.removeRow"), () => this.removeRow());
    action(ICON.removeColumn, t("table.removeColumn"), () => this.removeColumn());
    action(ICON.series, t("table.fillSeries"), () => this.fillSeries());
    action(ICON.sum, t("table.sumColumns"), () => this.addTotals());
    action(ICON.remove, t("table.removeTable"), () => this.removeTable());
    page.appendChild(this.bar);

    document.addEventListener("selectionchange", () => this.track(), { signal });
    editor.addEventListener("keydown", (e) => this.keydown(e));
    editor.addEventListener("input", () => {
      if (this.cell) {
        this.recompute(this.cell);
        this.place();
      }
    });
    editor.addEventListener("blur", () => window.setTimeout(() => this.track()));
  }

  /** On opening a document: computes all the formulas. */
  refresh(): void {
    this.cell = null;
    this.bar.hidden = true;
    for (const table of this.editor.querySelectorAll("table")) this.recomputeTable(table);
  }

  private currentCell(): HTMLTableCellElement | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount || document.activeElement !== this.editor) return null;
    const node = selection.getRangeAt(0).startContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const cell = element?.closest<HTMLTableCellElement>("td, th") ?? null;
    return cell && this.editor.contains(cell) ? cell : null;
  }

  /** Follows the cursor: leaving a cell computes its formula; entering it shows it. */
  private track(): void {
    const cell = this.currentCell();
    if (cell === this.cell) return;
    if (this.cell?.isConnected) this.leave(this.cell);
    this.cell = cell;
    if (cell) this.enter(cell);
    this.place();
  }

  private enter(cell: HTMLTableCellElement): void {
    const formula = cell.getAttribute("data-formula");
    if (!formula || cell.textContent === formula) return;
    cell.textContent = formula;
    // The cursor at the end of the formula.
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private leave(cell: HTMLTableCellElement): void {
    const text = cell.textContent?.trim() ?? "";
    if (text.startsWith("=") && isFormula(text)) {
      cell.setAttribute("data-formula", text);
    } else if (cell.hasAttribute("data-formula")) {
      // A value (or something that is not a valid formula) was typed instead of the formula.
      cell.removeAttribute("data-formula");
    }
    // Nobody is editing it now: it shows its result.
    const table = cell.closest("table");
    if (table) this.recomputeTable(table, null);
    this.onChange();
  }

  /** Before saving or exporting: the cell being edited saves its new formula
   *  (while still showing it to the person typing). */
  sync(): void {
    const cell = this.cell;
    if (!cell?.isConnected) return;
    const text = cell.textContent?.trim() ?? "";
    if (text.startsWith("=") && isFormula(text)) cell.setAttribute("data-formula", text);
    else cell.removeAttribute("data-formula");
  }

  /** The table's formulas keep pointing at the same cells when a row or a
   *  column is added or removed. */
  private shift(table: HTMLTableElement, axis: "row" | "col", index: number, delta: 1 | -1): void {
    [...table.rows].forEach((row, r) =>
      cellsOf(row).forEach((cell, c) => {
        const formula = cell.getAttribute("data-formula");
        if (formula) cell.setAttribute("data-formula", shiftFormula(formula, axis, index, delta, axis === "row" ? r : c));
      }),
    );
  }

  private table(): HTMLTableElement | null {
    return this.cell?.closest("table") ?? null;
  }

  private recompute(editing: HTMLTableCellElement | null = this.cell): void {
    const table = editing?.closest("table") ?? this.table();
    if (table) this.recomputeTable(table, editing);
  }

  /** Computes a table's formulas; the cell being edited shows its formula. */
  private recomputeTable(table: HTMLTableElement, editing: HTMLTableCellElement | null = null): void {
    const rows = [...table.rows];
    const cells = rows.map((row) => cellsOf(row).map((cell) => (cell === editing ? "" : (cell.textContent ?? ""))));
    const formulas = new Map<string, string>();
    rows.forEach((row, r) =>
      cellsOf(row).forEach((cell, c) => {
        const formula = cell.getAttribute("data-formula");
        if (formula && cell !== editing) formulas.set(`${r},${c}`, formula);
      }),
    );
    // The cell being edited also counts with its new formula, if it already is one.
    if (editing) {
      const text = editing.textContent?.trim() ?? "";
      const r = rows.indexOf(editing.parentElement as HTMLTableRowElement);
      const c = cellsOf(editing.parentElement as HTMLTableRowElement).indexOf(editing);
      if (text.startsWith("=") && isFormula(text)) formulas.set(`${r},${c}`, text);
      else cells[r][c] = text;
    }
    const results = computeTable(cells, formulas);
    for (const [key, value] of results) {
      const [r, c] = key.split(",").map(Number);
      const cell = rows[r].cells[c];
      if (cell === editing) continue;
      cell.classList.toggle("formula-error", value.startsWith("#"));
      if (cell.textContent !== value) cell.textContent = value;
    }
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    // The current cell: when typing fast, the selection change notice arrives late.
    this.track();
    if (!this.cell) return;
    e.preventDefault();
    const table = this.table()!;
    const all = [...table.querySelectorAll<HTMLTableCellElement>("td, th")];
    let index = all.indexOf(this.cell) + (e.shiftKey ? -1 : 1);
    if (index >= all.length) {
      // The formula being edited is saved first, so its cells adjust to the new row.
      this.leave(this.cell);
      this.addRow();
      this.enter(this.cell);
      this.onChange();
      index = all.length;
    }
    const next = [...table.querySelectorAll<HTMLTableCellElement>("td, th")][Math.max(0, index)];
    if (!next) return;
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.track();
  }

  private position(): { row: HTMLTableRowElement; column: number } | null {
    if (!this.cell) return null;
    const row = this.cell.parentElement as HTMLTableRowElement;
    return { row, column: cellsOf(row).indexOf(this.cell) };
  }

  private newCell(tag = "td"): HTMLTableCellElement {
    const cell = document.createElement(tag) as HTMLTableCellElement;
    cell.appendChild(document.createElement("br"));
    return cell;
  }

  private addRow(): void {
    const at = this.position();
    const table = this.table();
    if (!at || !table) return;
    // Below the current row; if it is the header, it still goes below with normal cells.
    const row = document.createElement("tr");
    for (let i = 0; i < at.row.cells.length; i++) row.appendChild(this.newCell());
    this.shift(table, "row", at.row.rowIndex + 1, 1);
    at.row.after(row);
  }

  private addColumn(): void {
    const at = this.position();
    const table = this.table();
    if (!at || !table) return;
    this.shift(table, "col", at.column + 1, 1);
    for (const row of table.rows) {
      const reference = row.cells[at.column];
      const cell = this.newCell(reference?.tagName === "TH" ? "th" : "td");
      if (reference) reference.after(cell);
      else row.appendChild(cell);
    }
  }

  private removeRow(): void {
    const at = this.position();
    const table = this.table();
    if (!at || !table) return;
    if (table.rows.length <= 1) return this.removeTable();
    this.shift(table, "row", at.row.rowIndex, -1);
    this.moveCaretOut(at.row.nextElementSibling ?? at.row.previousElementSibling);
    at.row.remove();
  }

  private removeColumn(): void {
    const at = this.position();
    const table = this.table();
    if (!at || !table) return;
    if (at.row.cells.length <= 1) return this.removeTable();
    this.shift(table, "col", at.column, -1);
    for (const row of table.rows) row.cells[at.column]?.remove();
    this.moveCaretOut(at.row.cells[Math.min(at.column, at.row.cells.length - 1)]);
  }

  private removeTable(): void {
    const table = this.table();
    if (!table) return;
    const after = table.nextElementSibling ?? table.previousElementSibling;
    table.remove();
    this.cell = null;
    if (after) this.moveCaretOut(after);
  }

  private moveCaretOut(target: Element | null): void {
    this.cell = null;
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /** Fills the current column downward following the pattern of its first cells. */
  private fillSeries(): void {
    const at = this.position();
    const table = this.table();
    if (!at || !table) return;
    const body = [...table.rows].filter((row) => row.cells[at.column]?.tagName !== "TH");
    const column = body.map((row) => row.cells[at.column]).filter(Boolean);
    const texts = column.map((cell) => (cell.hasAttribute("data-formula") ? "" : (cell.textContent?.trim() ?? "")));
    let seed = 0;
    while (seed < texts.length && texts[seed]) seed++;
    if (seed === 0) return;
    let empty = column.slice(seed).filter((_, i) => !texts[seed + i]);
    // If there is no room left, five rows are added.
    if (!empty.length) {
      const last = table.rows[table.rows.length - 1];
      for (let i = 0; i < 5; i++) {
        const row = document.createElement("tr");
        for (let j = 0; j < last.cells.length; j++) row.appendChild(this.newCell());
        const body = table.tBodies[0];
        if (body) body.appendChild(row);
        else table.appendChild(row);
      }
      empty = [...table.rows].slice(-5).map((row) => row.cells[at.column]);
    }
    const values = continueSeries(texts.slice(0, seed), empty.length);
    if (!values) {
      this.flash(t("table.noPattern"));
      return;
    }
    empty.forEach((cell, i) => (cell.textContent = values[i]));
  }

  /** A total row at the end, with the sum of each column that has numbers. */
  private addTotals(): void {
    const table = this.table();
    if (!table) return;
    const rows = [...table.rows];
    let last = rows[rows.length - 1];
    // The label is written in the language of the moment: a total row made in
    // another language ("Total" in all three today) is still recognized.
    const labels = new Set(["total", t("table.total").toLowerCase()]);
    const isTotal = (row: HTMLTableRowElement) => labels.has(row.cells[0]?.textContent?.trim().toLowerCase() ?? "");
    if (!isTotal(last)) {
      last = document.createElement("tr");
      for (let i = 0; i < rows[0].cells.length; i++) last.appendChild(this.newCell());
      rows[rows.length - 1].after(last);
    }
    const all = [...table.rows];
    const totalIndex = all.indexOf(last);
    const firstBody = all.findIndex((row) => row.cells[0]?.tagName !== "TH");
    if (firstBody < 0 || firstBody >= totalIndex) return;
    let labelled = false;
    for (let c = 0; c < last.cells.length; c++) {
      const numeric = all.slice(firstBody, totalIndex).some((row) => /\d/.test(row.cells[c]?.textContent ?? ""));
      const cell = last.cells[c];
      if (numeric && c > 0) {
        cell.setAttribute("data-formula", `=SUMA(${columnName(c)}${firstBody + 1}:${columnName(c)}${totalIndex})`);
      } else if (c === 0 && !labelled) {
        cell.removeAttribute("data-formula");
        cell.textContent = t("table.total");
        labelled = true;
      }
    }
    this.recomputeTable(table, null);
  }

  private flash(text: string): void {
    this.bar.dataset.message = text;
    this.bar.classList.add("message");
    window.setTimeout(() => this.bar.classList.remove("message"), 2200);
  }

  /** The bar floats right above the table, on the right. */
  private place(): void {
    const table = this.table();
    const editable = this.editor.isContentEditable;
    this.bar.hidden = !table || !editable;
    if (!table || !editable) return;
    const zoom = this.zoom();
    const pageRect = this.page.getBoundingClientRect();
    const rect = table.getBoundingClientRect();
    // The bar lives inside the scaled page: the zoom is offset so it keeps the same size.
    this.bar.style.setProperty("--inv", String(1 / zoom));
    this.bar.style.left = `${(rect.right - pageRect.left) / zoom}px`;
    this.bar.style.top = `${(rect.top - pageRect.top) / zoom}px`;
  }
}

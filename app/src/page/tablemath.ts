// The calculations in tables: the most useful parts of a spreadsheet, without
// overwhelming.
//
// - Formulas that start with "=": numbers, + - * / ^ %, parentheses, cells
//   (A1 is column A, row 1), ranges (A1:B3) and a few functions, with their
//   Spanish, English or Brazilian Portuguese names, as in Excel: SUMA / SUM /
//   SOMA, PROMEDIO / AVERAGE / MÉDIA, MIN / MÍNIMO, MAX / MÁXIMO, CONTAR /
//   COUNT / CONT.NÚM, REDONDEAR / ROUND / ARRED, ABS. Accents are optional.
//   Formulas are saved as typed, so every name keeps working in every language.
// - Fill series: 1, 2 → 3, 4…; Monday, Tuesday → Wednesday…; January →
//   February… (in English, Spanish or Portuguese); "Item 1", "Item 2" → "Item 3"…
//
// Everything is pure (no DOM) so it can be tested.

import { currentLocale, t as tr, type Locale } from "../core/i18n";

export type CellValue = number | string;

/** Reads a cell: the number it holds, or its text. Accepts "3,5", "1.234,5"
 *  and "1,234.5". A number with only one kind of mark, like "40,046" or
 *  "1.250", is read as the language writes it: in English the comma groups
 *  thousands, in Spanish and Portuguese the point does. */
export function cellNumber(text: string, decimal: "." | "," = localeDecimal()): number | null {
  let t = text.trim().replace(/\s/g, "").replace(/[$€£%]$/, "").replace(/^[$€£]/, "");
  if (!t) return null;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) t = t.replace(/,/g, "");
  else if (decimal === "." && /^-?\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  else if (decimal === "," && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "A" → 0, "B" → 1, … "AA" → 26. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export class FormulaError extends Error {}

/** Reads a cell by row and column (from 0). Returns its number, or null if it has none. */
export type CellReader = (row: number, column: number) => number | null;

type Token = { kind: "num"; value: number } | { kind: "ref"; row: number; col: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

const FUNCTIONS: Record<string, (values: number[]) => number> = {
  SUMA: (v) => v.reduce((a, b) => a + b, 0),
  PROMEDIO: (v) => {
    if (!v.length) throw new FormulaError(tr("tablemath.noNumbers"));
    return v.reduce((a, b) => a + b, 0) / v.length;
  },
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  CONTAR: (v) => v.length,
  ABS: (v) => Math.abs(v[0] ?? 0),
  REDONDEAR: (v) => {
    const digits = Math.max(0, Math.min(10, Math.trunc(v[1] ?? 0)));
    const f = 10 ** digits;
    return Math.round((v[0] ?? 0) * f) / f;
  },
};
/** Other names for the same functions (written without accents: names are
 *  compared without them, so MÉDIA and MEDIA are the same). English, and
 *  Brazilian Portuguese as Excel names them. */
const ALIASES: Record<string, string> = {
  SUM: "SUMA",
  AVERAGE: "PROMEDIO",
  PROM: "PROMEDIO",
  COUNT: "CONTAR",
  ROUND: "REDONDEAR",
  SOMA: "SUMA",
  MEDIA: "PROMEDIO",
  MINIMO: "MIN",
  MAXIMO: "MAX",
  "CONT.NUM": "CONTAR",
  ARRED: "REDONDEAR",
};

/** A function name without accents, so "MÉDIA" and "MEDIA" are the same. */
const plain = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "");

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[\d.]/.test(c)) {
      // Decimal comma, as written in Spanish and Portuguese: "3,5" (a point works
      // too). Between arguments goes ";" (or a comma with a space: "SUMA(1, 5)").
      const m = source.slice(i).match(/^(\d+(?:[.,]\d+)?\.?|\.\d+)/);
      if (!m) throw new FormulaError(tr("tablemath.invalidNumber"));
      tokens.push({ kind: "num", value: Number(m[0].replace(",", ".")) });
      i += m[0].length;
    } else if (/\p{L}/u.test(c)) {
      // A cell (A1) or a function name, which may have a dot inside (CONT.NÚM).
      const m = source.slice(i).match(/^\p{L}+(?:\.\p{L}+)*\d*/u)!;
      const ref = m[0].match(/^([A-Za-z]{1,2})(\d+)$/);
      if (ref) tokens.push({ kind: "ref", col: columnIndex(ref[1]), row: Number(ref[2]) - 1 });
      else tokens.push({ kind: "name", value: m[0].toUpperCase() });
      i += m[0].length;
    } else if ("+-*/^%(),;:".includes(c)) {
      tokens.push({ kind: "op", value: c });
      i++;
    } else {
      throw new FormulaError(tr("tablemath.unknownSign", { sign: c }));
    }
  }
  return tokens;
}

/** Computes a formula ("=..."). Throws FormulaError if it cannot. */
export function evaluate(formula: string, read: CellReader): number {
  const tokens = tokenize(formula.replace(/^=/, ""));
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) => peek()?.kind === "op" && (peek() as { value: string }).value === value;
  const expectOp = (value: string) => {
    if (!isOp(value)) throw new FormulaError(tr("tablemath.missing", { sign: value }));
    pos++;
  };
  const cell = (row: number, col: number) => read(row, col) ?? 0;

  // The arguments of a function: single numbers or ranges (which add several).
  const argument = (): number[] => {
    const t = peek();
    const next = tokens[pos + 1];
    if (t?.kind === "ref" && next?.kind === "op" && next.value === ":") {
      const end = tokens[pos + 2];
      if (end?.kind !== "ref") throw new FormulaError(tr("tablemath.incompleteRange"));
      pos += 3;
      const values: number[] = [];
      const [r0, r1] = [Math.min(t.row, end.row), Math.max(t.row, end.row)];
      const [c0, c1] = [Math.min(t.col, end.col), Math.max(t.col, end.col)];
      if ((r1 - r0 + 1) * (c1 - c0 + 1) > 100000) throw new FormulaError(tr("tablemath.rangeTooBig"));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const v = read(r, c);
          if (v !== null) values.push(v);
        }
      }
      return values;
    }
    return [expression()];
  };

  const primary = (): number => {
    const t = peek();
    if (!t) throw new FormulaError(tr("tablemath.incomplete"));
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (t.kind === "ref") {
      pos++;
      return cell(t.row, t.col);
    }
    if (t.kind === "name") {
      const key = plain(t.value);
      const fn = FUNCTIONS[ALIASES[key] ?? key];
      if (!fn) throw new FormulaError(tr("tablemath.unknownFunction", { name: t.value }));
      pos++;
      expectOp("(");
      const values: number[] = [];
      if (!isOp(")")) {
        values.push(...argument());
        while (isOp(";") || isOp(",")) {
          pos++;
          values.push(...argument());
        }
      }
      expectOp(")");
      return fn(values);
    }
    if (isOp("(")) {
      pos++;
      const value = expression();
      expectOp(")");
      return value;
    }
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    throw new FormulaError(tr("tablemath.incomplete"));
  };

  const unary = (): number => {
    let value = primary();
    // 50% → 0.5
    while (isOp("%")) {
      pos++;
      value /= 100;
    }
    return value;
  };

  const power = (): number => {
    const base = unary();
    if (isOp("^")) {
      pos++;
      return base ** power();
    }
    return base;
  };

  const term = (): number => {
    let value = power();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = power();
      if (op === "/" && right === 0) throw new FormulaError(tr("tablemath.divisionByZero"));
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };

  function expression(): number {
    let value = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = expression();
  if (pos < tokens.length) throw new FormulaError(tr("tablemath.extraAtEnd"));
  if (!Number.isFinite(result)) throw new FormulaError(tr("tablemath.invalidResult"));
  return result;
}

/** Adjusts the references of a formula when a row (`axis` "row") or a column
 *  ("col") is added or removed at `index` (from 0):
 *  - when adding (`delta` 1), whatever was from `index` on moves by one;
 *  - when removing (`delta` -1), whatever was after moves up by one; a range
 *    shrinks and a cell that no longer exists becomes `REF()`, which shows an error.
 *  If something is added right below (or to the right of) a range and the
 *  formula is further on, like a total row, the range grows to include it. */
export function shiftFormula(formula: string, axis: "row" | "col", index: number, delta: 1 | -1, own: number): string {
  const pattern = /(?<![\p{L}\d.])([A-Za-z]{1,2})(\d+)(?::([A-Za-z]{1,2})(\d+))?(?![\dA-Za-z(])/gu;
  const get = (col: string, row: string) => (axis === "row" ? Number(row) - 1 : columnIndex(col));
  const put = (col: string, row: string, value: number) => (axis === "row" ? `${col}${value + 1}` : `${columnName(value)}${row}`);
  return formula.replace(pattern, (match, c1: string, r1: string, c2?: string, r2?: string) => {
    const start = get(c1, r1);
    if (c2 === undefined || r2 === undefined) {
      if (delta === 1) return start >= index ? put(c1, r1, start + 1) : match;
      if (start === index) return "REF()";
      return start > index ? put(c1, r1, start - 1) : match;
    }
    const end = get(c2, r2);
    let [from, to] = [Math.min(start, end), Math.max(start, end)];
    if (delta === 1) {
      if (from >= index) from++;
      if (to >= index || (to === index - 1 && own >= index)) to++;
    } else {
      if (from > index) from--;
      if (to >= index) to--;
      if (from > to) return "REF()";
    }
    return `${put(c1, r1, from)}:${put(c2, r2, to)}`;
  });
}

/** The decimal mark of the current language: a point in English, a comma in
 *  Spanish and Portuguese. */
function localeDecimal(): "." | "," {
  return currentLocale() === "en" ? "." : ",";
}

/** A number as the table shows it: no extra decimals, with the decimal mark of
 *  the language (or the one given). */
export function formatNumber(n: number, decimal: "." | "," = localeDecimal()): string {
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded).replace(".", decimal);
}

/** Computes all the formulas of a table. `cells[row][column]` is the text of
 *  each cell and `formulas` the ones that have a formula. Returns the text to
 *  show in each cell with a formula (an error mark like "#error" or "#cycle",
 *  in the current language, when it can't). Results are recomputed every time
 *  a document opens, so the shown text can follow the language. */
export function computeTable(cells: string[][], formulas: Map<string, string>): Map<string, string> {
  const results = new Map<string, string>();
  // An error is remembered as an error: whatever depends on it also fails,
  // no matter in which order the cells are computed.
  const values = new Map<string, number | Error>();
  const visiting = new Set<string>();

  const valueOf = (row: number, col: number): number | null => {
    const key = `${row},${col}`;
    const known = values.get(key);
    if (known instanceof Error) throw known;
    if (known !== undefined) return known;
    const formula = formulas.get(key);
    if (!formula) {
      const text = cells[row]?.[col];
      return text === undefined ? null : cellNumber(text);
    }
    if (visiting.has(key)) throw new CycleError();
    visiting.add(key);
    try {
      const value = evaluate(formula, valueOf);
      values.set(key, value);
      return value;
    } catch (error) {
      values.set(key, error instanceof Error ? error : new FormulaError(tr("tablemath.error")));
      throw error;
    } finally {
      visiting.delete(key);
    }
  };

  for (const [key, formula] of formulas) {
    const [row, col] = key.split(",").map(Number);
    try {
      const value = valueOf(row, col);
      results.set(key, value === null ? "" : formatNumber(value));
    } catch (error) {
      results.set(key, error instanceof CycleError ? tr("tablemath.cycle") : tr("tablemath.error"));
      if (!(error instanceof FormulaError) && !(error instanceof CycleError)) console.error(error, formula);
    }
  }
  return results;
}

class CycleError extends Error {}

// ---------- Series ----------

/** Days and months in each language, as data: a series keeps the language it
 *  was written in. Portuguese days are the short everyday names ("segunda");
 *  the long form ("segunda-feira") is recognized too. */
const CYCLES: Record<Locale, { weekdays: string[]; months: string[] }> = {
  en: {
    weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    months: ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  },
  es: {
    weekdays: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  },
  pt: {
    weekdays: ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"],
    months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  },
};

/** The cycles to try, the current language first: "Mar" is March in English
 *  and "marzo" in Spanish, so the language of the moment decides. */
function cycles(): string[][] {
  const order: Locale[] = ["en", "es", "pt"];
  const current = currentLocale();
  const sorted = [current, ...order.filter((l) => l !== current)];
  return sorted.flatMap((l) => [CYCLES[l].weekdays, CYCLES[l].months]);
}

/** Portuguese weekdays may be written in full: "segunda-feira". */
const FEIRA = "-feira";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Keeps the way it was written: "Monday", "MONDAY" or "monday". */
function sameCase(model: string, word: string): string {
  if (model === model.toUpperCase() && model !== model.toLowerCase()) return word.toUpperCase();
  if (model[0] === model[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** Continues a series from its first values. Returns `count` new values, or
 *  null if no pattern is recognized. */
export function continueSeries(values: string[], count: number): string[] | null {
  const seed = values.map((v) => v.trim()).filter(Boolean);
  if (!seed.length || count <= 0) return null;
  const last = seed[seed.length - 1];

  // Numbers: the step is the difference between the last two (or 1 if there is only one).
  const numbers = seed.map((v) => cellNumber(v));
  if (numbers.every((n) => n !== null)) {
    const ns = numbers;
    const step = ns.length > 1 ? ns[ns.length - 1] - ns[ns.length - 2] : 1;
    // If the first ones don't follow the same step, it doesn't guess.
    for (let i = 1; i < ns.length; i++) if (Math.abs(ns[i] - ns[i - 1] - step) > 1e-9) return null;
    // The decimal mark the person used, or else the language's.
    const decimal = seed.some((v) => /\d,\d/.test(v)) ? "," : seed.some((v) => /\d\.\d/.test(v)) ? "." : localeDecimal();
    return Array.from({ length: count }, (_, i) => formatNumber(ns[ns.length - 1] + step * (i + 1), decimal));
  }

  // Days and months, which start over.
  const long = fold(last).endsWith(FEIRA);
  const bare = (v: string) => fold(v).replace(/-feira$/, "");
  for (const cycle of cycles()) {
    const indexes = seed.map((v) => cycle.findIndex((w) => fold(w) === bare(v) || (v.length >= 3 && fold(w).startsWith(fold(v)) && fold(v).length === 3)));
    if (indexes.every((i) => i >= 0)) {
      const step = indexes.length > 1 ? (indexes[indexes.length - 1] - indexes[indexes.length - 2] + cycle.length) % cycle.length || 1 : 1;
      const short = last.length === 3;
      return Array.from({ length: count }, (_, i) => {
        const index = (indexes[indexes.length - 1] + step * (i + 1)) % cycle.length;
        let word = cycle[index];
        // "segunda-feira" → "terça-feira", but Saturday and Sunday have no "-feira".
        if (long && index < 5) word += FEIRA;
        return sameCase(last, short ? word.slice(0, 3) : word);
      });
    }
  }

  // Text with a number at the end: "Item 1", "Item 2" → "Item 3".
  const parts = seed.map((v) => v.match(/^(.*?)(\d+)$/));
  if (parts.every(Boolean) && parts.every((p) => p![1] === parts[0]![1])) {
    const ns = parts.map((p) => Number(p![2]));
    const step = ns.length > 1 ? ns[ns.length - 1] - ns[ns.length - 2] : 1;
    const width = parts[parts.length - 1]![2].length;
    return Array.from({ length: count }, (_, i) => {
      const n = ns[ns.length - 1] + step * (i + 1);
      const digits = n >= 0 && parts[parts.length - 1]![2].startsWith("0") ? String(n).padStart(width, "0") : String(n);
      return parts[0]![1] + digits;
    });
  }
  return null;
}

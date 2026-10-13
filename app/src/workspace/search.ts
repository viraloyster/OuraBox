// Search: finds words even when they are spelled differently.
//
// Memory doesn't keep spelling: you remember "something about a centipede"
// ("ciempiés"), not whether you wrote "cienpies". So each word is compared in
// three ways, from strictest to most tolerant:
//
// 1. Equal, or as the start of a word, ignoring accents and case ("cien" → "Ciempiés").
// 2. Equal to how it sounds in Spanish: b/v, s/z/c, ll/y, silent h, m/n before p/b…
// 3. With few letters of difference (Damerau-Levenshtein distance: one letter
//    extra, missing, changed, or two letters swapped).
//
// No AI and no libraries: everything happens in memory, with the space open.

export interface SearchDocument {
  id: string;
  title: string;
  text: string;
}

export interface Highlight {
  start: number;
  end: number;
}

export interface SearchResult {
  id: string;
  score: number;
  /** The parts of the title that match. */
  titleMatches: Highlight[];
  /** A fragment of the text around the first match. */
  snippet: string;
  snippetMatches: Highlight[];
}

interface Token {
  start: number;
  end: number;
  plain: string;
  sound: string;
}

interface IndexedDocument {
  id: string;
  title: string;
  text: string;
  titleTokens: Token[];
  textTokens: Token[];
}

export type SearchIndex = IndexedDocument[];

/** Without accents and in lowercase: "Ciempiés" → "ciempies". The ñ becomes n. */
export function plain(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Roughly how a word sounds in Spanish. Takes a word already without accents. */
export function sound(word: string): string {
  return word
    .replace(/qu(?=[ei])/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/ch/g, "#")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/w/g, "b")
    .replace(/ll/g, "y")
    .replace(/g(?=[ei])/g, "j")
    .replace(/h/g, "")
    .replace(/n(?=[bp])/g, "m")
    .replace(/(.)\1+/g, "$1");
}

/** How many letters must be added, removed, changed or swapped to go from `a` to `b`.
 *  Stops as soon as it passes `max`, to waste no time on very different words. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  // Only the two previous rows of the table are needed.
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current[j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    const p = plain(match[0]);
    tokens.push({ start, end: start + match[0].length, plain: p, sound: sound(p) });
  }
  return tokens;
}

export function buildIndex(documents: SearchDocument[]): SearchIndex {
  return documents.map((d) => ({ ...d, titleTokens: tokenize(d.title), textTokens: tokenize(d.text) }));
}

/** How many different letters are tolerated, by the length of the searched word. */
function tolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/** How well a word of the document matches one of the query (0 = not at all). */
function matchScore(query: Token, token: Token): number {
  if (token.plain === query.plain) return 4;
  if (query.plain.length >= 2 && token.plain.startsWith(query.plain)) return 3;
  if (query.plain.length >= 3 && (token.sound === query.sound || token.sound.startsWith(query.sound))) return 2.5;
  const max = tolerance(query.plain.length);
  if (max > 0) {
    const d = distance(query.plain, token.plain, max);
    if (d <= max) return 2.2 - d * 0.4;
    // Also as a start: "ciempi" finds "cienpies" while typing.
    if (token.plain.length > query.plain.length && distance(query.plain, token.plain.slice(0, query.plain.length), max) <= max) {
      return 1.5;
    }
  }
  if (query.plain.length >= 4 && token.plain.includes(query.plain)) return 1.2;
  return 0;
}

/** The best match of a word in a list, with the positions of all those that score the same. */
function bestMatch(query: Token, tokens: Token[]): { score: number; hits: Highlight[] } {
  let score = 0;
  let hits: Highlight[] = [];
  const seen = new Map<string, number>();
  for (const token of tokens) {
    let value = seen.get(token.plain);
    if (value === undefined) {
      value = matchScore(query, token);
      seen.set(token.plain, value);
    }
    if (value === 0) continue;
    if (value > score) {
      score = value;
      hits = [];
    }
    if (value === score) hits.push({ start: token.start, end: token.end });
  }
  return { score, hits };
}

export interface SearchOptions {
  /** Only in titles. */
  titlesOnly?: boolean;
  /** If given, only these documents. */
  ids?: Set<string>;
  limit?: number;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 140;

export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchResult[] {
  const words = tokenize(query);
  if (!words.length) return [];
  const results: SearchResult[] = [];
  for (const doc of index) {
    if (options.ids && !options.ids.has(doc.id)) continue;
    let score = 0;
    const titleMatches: Highlight[] = [];
    const textMatches: Highlight[] = [];
    let all = true;
    for (const word of words) {
      const inTitle = bestMatch(word, doc.titleTokens);
      const inText = options.titlesOnly ? { score: 0, hits: [] } : bestMatch(word, doc.textTokens);
      if (!inTitle.score && !inText.score) {
        all = false;
        break;
      }
      // A match in the title weighs a bit more.
      score += Math.max(inTitle.score * 1.5, inText.score);
      titleMatches.push(...inTitle.hits);
      textMatches.push(...inText.hits);
    }
    if (!all) continue;
    const { snippet, snippetMatches } = makeSnippet(doc.text, textMatches);
    results.push({ id: doc.id, score, titleMatches: merge(titleMatches), snippet, snippetMatches });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, options.limit ?? 50);
}

function merge(hits: Highlight[]): Highlight[] {
  const sorted = [...hits].sort((a, b) => a.start - b.start);
  const merged: Highlight[] = [];
  for (const hit of sorted) {
    const last = merged[merged.length - 1];
    if (last && hit.start <= last.end) last.end = Math.max(last.end, hit.end);
    else merged.push({ ...hit });
  }
  return merged;
}

/** A short fragment around the first match, on a single line. */
function makeSnippet(text: string, hits: Highlight[]): { snippet: string; snippetMatches: Highlight[] } {
  const sorted = merge(hits);
  const first = sorted[0]?.start ?? 0;
  let start = Math.max(0, first - SNIPPET_BEFORE);
  // Start at a word boundary.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < first) start = space + 1;
  }
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const body = text.slice(start, end).replace(/\s/g, " ");
  const snippetMatches = sorted
    .filter((h) => h.start >= start && h.end <= end)
    .map((h) => ({ start: h.start - start + prefix.length, end: h.end - start + prefix.length }));
  return { snippet: prefix + body + suffix, snippetMatches };
}

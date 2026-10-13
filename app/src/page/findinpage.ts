// Find in the open page: every place the query appears, ignoring accents and
// case ("cafe" finds "Café").

/** Each letter without accent and in lowercase, one by one: the folded text has
 *  the same length as the original, so positions work for both. */
export function foldText(text: string): string {
  let folded = "";
  for (const char of text) {
    const plain = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    // If folding changes the length (rare), the letter is left as it was.
    folded += plain.length === char.length ? plain : char.length === 1 ? char.toLowerCase().slice(0, 1) : char;
  }
  return folded;
}

/** Where each occurrence of `query` in `text` starts. */
export function findAll(text: string, query: string, limit = 500): number[] {
  const needle = foldText(query.trim());
  if (!needle) return [];
  const haystack = foldText(text);
  const found: number[] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1 && found.length < limit) {
    found.push(at);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

export interface PageMatch {
  range: Range;
  /** A piece of the surrounding text, with the part that matches. */
  snippet: string;
  start: number;
  end: number;
}

/** The occurrences inside an element, as ranges that can be selected. */
export function findInElement(root: HTMLElement, query: string): PageMatch[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  // All the text in a row, remembering where each node starts.
  const starts: number[] = [];
  let text = "";
  let block: Element | null = null;
  for (const node of nodes) {
    // A line break between paragraphs, so words from different blocks don't run together.
    const parent = node.parentElement?.closest("p, div, h1, h2, h3, li, td, th, blockquote") ?? null;
    if (text && parent !== block) text += "\n";
    block = parent;
    starts.push(text.length);
    text += node.data;
  }
  const length = query.trim().length;
  const locate = (offset: number, end = false): [Text, number] => {
    // The node containing that position (at the end of a node, if it is the end of the match).
    let i = nodes.length - 1;
    while (i > 0 && (starts[i] > offset || (end && starts[i] === offset))) i--;
    return [nodes[i], offset - starts[i]];
  };
  return findAll(text, query).map((at) => {
    const range = document.createRange();
    const [startNode, startOffset] = locate(at);
    const [endNode, endOffset] = locate(at + length, true);
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const from = Math.max(0, at - 30);
    const prefix = from > 0 ? "…" : "";
    const snippet = prefix + text.slice(from, at + length + 50).replace(/\s+/g, " ");
    const start = prefix.length + text.slice(from, at).replace(/\s+/g, " ").length;
    return { range, snippet, start, end: start + text.slice(at, at + length).replace(/\s+/g, " ").length };
  });
}

// The most useful parts of a word processor, without overwhelming: alignment,
// font size and color, numbered list, task list, divider line and table.
//
// Formatting is saved in `data-` attributes with a closed set of values (see
// sanitize.ts), never in `style`: so a document cannot bring in foreign
// styles, and the colors follow the chosen sky.

export type Align = "left" | "center" | "right" | "justify";
/** The font sizes that can be chosen, in points (like in Word). */
export const FONT_SIZES = { min: 6, max: 96, common: [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72] };
export type InlineFormat = "data-size" | "data-color" | "data-outline" | "data-outline-color" | "data-hollow";
export type TextColor = "agua" | "coral" | "sol" | "alga" | "crepusculo" | "tenue";

const BLOCK_SELECTOR = "p, div, h1, h2, h3, li, blockquote, td, th";

function selectionIn(editor: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/** The blocks (paragraphs, headings, items, cells) the selection touches. */
export function selectedBlocks(editor: HTMLElement): HTMLElement[] {
  let range = selectionIn(editor);
  if (!range) return [];
  // Loose text, outside a paragraph: it is turned into a paragraph first.
  const start = elementOf(range.startContainer);
  if (start === editor || !start?.closest(BLOCK_SELECTOR)) {
    document.execCommand("formatBlock", false, "<p>");
    range = selectionIn(editor);
    if (!range) return [];
  }
  const blocks = [...editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter((block) => range.intersectsNode(block));
  // Only the innermost ones: the item, not the whole list; the cell, not the table.
  return blocks.filter((block) => !blocks.some((other) => other !== block && block.contains(other)));
}

export function setAlign(editor: HTMLElement, align: Align): void {
  for (const block of selectedBlocks(editor)) {
    if (align === "left") block.removeAttribute("data-align");
    else block.setAttribute("data-align", align);
  }
}

export function currentAlign(editor: HTMLElement): Align {
  const range = selectionIn(editor);
  const block = range ? elementOf(range.startContainer)?.closest<HTMLElement>(BLOCK_SELECTOR) : null;
  const value = block && editor.contains(block) ? block.getAttribute("data-align") : null;
  return (value as Align | null) ?? "left";
}

/** With nothing selected, the formatting goes to the word where the cursor is. */
function selectWordIfCollapsed(): void {
  const selection = window.getSelection() as Selection & { modify?: (alter: string, direction: string, granularity: string) => void };
  if (!selection?.isCollapsed || typeof selection.modify !== "function") return;
  selection.modify("move", "backward", "word");
  selection.modify("extend", "forward", "word");
}

const MARK = "ourabox-marca";

/** Takes `element` out of `ancestor`, splitting it in two: what comes before and
 *  after keeps the formatting; the middle part is left without `attribute`. */
function liftOut(element: Element, ancestor: HTMLElement, attribute: string): void {
  const before = document.createRange();
  before.setStart(ancestor, 0);
  before.setEndBefore(element);
  const after = document.createRange();
  after.setStartAfter(element);
  after.setEnd(ancestor, ancestor.childNodes.length);
  const left = before.extractContents();
  const right = after.extractContents();
  // A part without letters may hold an image or a line break: it is kept anyway.
  if (left.hasChildNodes()) {
    const wrap = ancestor.cloneNode(false) as HTMLElement;
    wrap.append(left);
    ancestor.before(wrap);
  }
  if (right.hasChildNodes()) {
    const wrap = ancestor.cloneNode(false) as HTMLElement;
    wrap.append(right);
    ancestor.after(wrap);
  }
  removeFormat(ancestor, attribute);
  unwrapIfPlain(ancestor);
}

/** A span with no attributes left adds nothing: it is replaced by its content. */
/** Takes a format off an element (a color also takes its painted color). */
function removeFormat(element: Element, attribute: string): void {
  element.removeAttribute(attribute);
  if (attribute === "data-color" && element instanceof HTMLElement) {
    element.style.removeProperty("color");
    if (!element.getAttribute("style")) element.removeAttribute("style");
  }
}

/** Paints a format that needs it: a color given as #rrggbb. */
function paintFormat(element: HTMLElement, attribute: string, value: string): void {
  if (attribute === "data-color" && value.startsWith("#")) element.style.color = value;
}

function unwrapIfPlain(element: Element): void {
  if (element.tagName === "SPAN" && element.attributes.length === 0) element.replaceWith(...element.childNodes);
}

/** Applies (or removes, with `value` null) a text format to the selection. */
export function setInline(editor: HTMLElement, attribute: InlineFormat, value: string | null): void {
  if (!selectionIn(editor)) return;
  selectWordIfCollapsed();
  if (window.getSelection()?.isCollapsed) return;
  // The browser knows how to split a selection that crosses paragraphs and bold
  // text: it is asked to mark it with a made-up font, and the mark is swapped for the format.
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontName", false, MARK);
  const marks = [...editor.querySelectorAll(`font[face="${MARK}"]`)];
  const placed: Node[] = [];
  for (const mark of marks) {
    // Out of any identical format wrapping it…
    let ancestor = mark.parentElement?.closest<HTMLElement>(`span[${attribute}]`);
    while (ancestor && editor.contains(ancestor)) {
      liftOut(mark, ancestor, attribute);
      ancestor = mark.parentElement?.closest<HTMLElement>(`span[${attribute}]`);
    }
    // …and without the same format inside.
    for (const inner of [...mark.querySelectorAll(`span[${attribute}]`)]) {
      removeFormat(inner, attribute);
      unwrapIfPlain(inner);
    }
    if (value) {
      const span = document.createElement("span");
      span.setAttribute(attribute, value);
      paintFormat(span, attribute, value);
      // See sanitize.ts: hollow letters are not spell-checked.
      if (attribute === "data-hollow") span.setAttribute("spellcheck", "false");
      span.append(...mark.childNodes);
      mark.replaceWith(span);
      placed.push(span);
    } else {
      const children = [...mark.childNodes];
      mark.replaceWith(...children);
      placed.push(...children);
    }
  }
  // The selection stays on the same text, to keep formatting it.
  if (placed.length) {
    const range = document.createRange();
    range.setStartBefore(placed[0]);
    range.setEndAfter(placed[placed.length - 1]);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  editor.normalize();
}

function closestList(editor: HTMLElement): HTMLElement | null {
  const range = selectionIn(editor);
  const list = range ? elementOf(range.startContainer)?.closest<HTMLElement>("ul, ol") : null;
  return list && editor.contains(list) ? list : null;
}

/** Blocks that may only hold text: a list inside one is invalid HTML. */
const TEXT_ONLY_BLOCKS = new Set(["P", "H1", "H2", "H3"]);

/** Takes a list out of the paragraph (or heading) it ended up in. On an empty
 *  `<p>` the browser builds the list inside it, `<p><ul>…</ul></p>`, which no
 *  parser would ever produce: once saved and opened again, the list jumps out
 *  of its paragraph and leaves empty lines around it. Whatever was beside the
 *  list stays in a paragraph of its own, and empty leftovers are dropped. */
export function liftList(list: HTMLElement, editor: HTMLElement): void {
  const isEmpty = (block: Element) => !block.textContent?.trim() && !block.querySelector("img, hr, table, ul, ol");
  // Moving the list would lose the cursor (a live range falls out of what is
  // moved), so its ends are noted as plain values and put back afterwards:
  // the nodes are the same ones, only in another place.
  const range = selectionIn(editor);
  const ends = range && list.contains(range.startContainer) && list.contains(range.endContainer) ? ([range.startContainer, range.startOffset, range.endContainer, range.endOffset] as const) : null;
  let parent = list.parentElement;
  while (parent && parent !== editor && TEXT_ONLY_BLOCKS.has(parent.tagName) && editor.contains(parent)) {
    const after = parent.cloneNode(false) as HTMLElement;
    while (list.nextSibling) after.appendChild(list.nextSibling);
    parent.after(list, after);
    if (isEmpty(after)) after.remove();
    if (isEmpty(parent)) parent.remove();
    parent = list.parentElement;
  }
  if (ends) {
    const restored = document.createRange();
    restored.setStart(ends[0], ends[1]);
    restored.setEnd(ends[2], ends[3]);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(restored);
  }
}

/** A numbered or bulleted list, never left inside a paragraph. */
export function toggleList(editor: HTMLElement, command: "insertOrderedList" | "insertUnorderedList"): void {
  document.execCommand(command);
  const list = closestList(editor);
  if (list) liftList(list, editor);
}

/** Task list: a list with checkboxes that are ticked with a click. */
export function toggleChecklist(editor: HTMLElement): void {
  const list = closestList(editor);
  if (list?.getAttribute("data-list") === "check") {
    toggleList(editor, "insertUnorderedList");
    return;
  }
  if (!list || list.tagName === "OL") toggleList(editor, "insertUnorderedList");
  closestList(editor)?.setAttribute("data-list", "check");
}

/** Ticks or unticks a task if the click landed on its checkbox. Returns whether it did. */
export function toggleTask(event: MouseEvent): boolean {
  const item = (event.target as Element | null)?.closest<HTMLElement>('ul[data-list="check"] > li');
  if (!item) return false;
  // The checkbox is to the left of the text, in the item's margin.
  if (event.clientX > item.getBoundingClientRect().left + 2) return false;
  if (item.getAttribute("data-checked") === "true") item.removeAttribute("data-checked");
  else item.setAttribute("data-checked", "true");
  return true;
}

export function insertLine(): void {
  document.execCommand("insertHorizontalRule");
}

/** A simple table, with the first row as the header. */
export function insertTable(rows = 3, columns = 3): void {
  const cell = (tag: string) => `<${tag}><br></${tag}>`;
  const row = (tag: string) => `<tr>${Array.from({ length: columns }, () => cell(tag)).join("")}</tr>`;
  const body = [row("th"), ...Array.from({ length: rows - 1 }, () => row("td"))].join("");
  document.execCommand("insertHTML", false, `<table data-new="1"><tbody>${body}</tbody></table><p><br></p>`);
  // The cursor goes to the first cell, to start typing.
  const table = document.querySelector<HTMLTableElement>('table[data-new="1"]');
  if (!table) return;
  table.removeAttribute("data-new");
  const first = table.querySelector("th, td");
  if (!first) return;
  const range = document.createRange();
  range.selectNodeContents(first);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** One style rule per size in points: the size lives in an attribute with a
 *  closed set of values, never in `style`. They are installed once, at startup. */
export function installSizeStyles(): void {
  const style = document.createElement("style");
  const rules: string[] = [];
  for (let size = FONT_SIZES.min; size <= FONT_SIZES.max; size++) rules.push(`[data-size="${size}"]{font-size:${size}pt}`);
  style.textContent = rules.join("\n");
  document.head.appendChild(style);
}

/** The font size where the cursor is, in points (rounded like Word, to half points). */
export function currentSize(editor: HTMLElement): number | null {
  const range = selectionIn(editor);
  const element = range ? elementOf(range.startContainer) : null;
  if (!element || !editor.contains(element)) return null;
  const px = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(px) ? Math.round(px * 0.75 * 2) / 2 : null;
}

/** A size typed by hand, kept within range; null if it is not a number. */
export function parseSize(text: string): number | null {
  const value = Math.round(Number(text.trim().replace(",", ".")));
  if (!text.trim() || !Number.isFinite(value)) return null;
  return Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, value));
}

/** The browser does not always use tags: to remove bold from a heading (which
 *  is already bold) it writes `style="font-weight: normal"`, which the cleanup
 *  would delete on save. It is moved to an attribute with a closed set of values. */
export function adoptInlineStyles(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>("[style*='font-weight']")) {
    const weight = element.style.fontWeight;
    element.style.removeProperty("font-weight");
    if (weight === "normal" || weight === "400") element.setAttribute("data-weight", "normal");
    else if (weight === "bold" || Number(weight) >= 600) element.setAttribute("data-weight", "bold");
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
  }
}

/** Enter on a ticked task creates the next one unticked (the browser copies
 *  the attributes of the previous item). */
export function uncheckNewTask(editor: HTMLElement): void {
  const node = window.getSelection()?.anchorNode ?? null;
  const element = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const item = element?.closest<HTMLElement>('ul[data-list="check"] > li');
  if (item && editor.contains(item) && !item.textContent?.trim()) item.removeAttribute("data-checked");
}

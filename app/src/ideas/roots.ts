// The roots map: a project's tree drawn from top to bottom, with the
// assumptions of each root in view. It shows at a glance what each problem
// (or each part of a universe) rests on.

import { t } from "../core/i18n";
import type { AssumptionState, MapNode } from "../core/storage";

const CARD_WIDTH = 220;
const GAP_X = 28;
const GAP_Y = 64;
const MAX_CHIPS = 4;

const stateLabel = (state: AssumptionState): string => t(`idea.states.${state}`);

interface TreeNode {
  id: string | null;
  title: string;
  kind?: MapNode["kind"];
  assumptions: MapNode["assumptions"];
  children: TreeNode[];
  width: number;
  x: number;
  level: number;
}

/** Builds the tree: the head is the project; below it, each root with the ones born from it. */
export function buildTree(name: string, nodes: MapNode[]): TreeNode {
  const known = new Set(nodes.map((n) => n.id));
  const make = (node: MapNode | null, level: number, seen: Set<string>): TreeNode => {
    const id = node?.id ?? null;
    const children = nodes
      .filter((n) => (id === null ? !n.parent || !known.has(n.parent) : n.parent === id) && !seen.has(n.id))
      .map((n) => make(n, level + 1, new Set([...seen, n.id])));
    return {
      id,
      title: node ? node.title || t("idea.untitled") : name,
      kind: node?.kind,
      assumptions: node?.assumptions ?? [],
      children,
      width: 0,
      x: 0,
      level,
    };
  };
  const root = make(null, 0, new Set());
  measure(root);
  place(root, 0);
  return root;
}

/** The width of each branch: that of its card or of all its roots together. */
function measure(node: TreeNode): number {
  const children = node.children.reduce((sum, child) => sum + measure(child), 0) + GAP_X * Math.max(0, node.children.length - 1);
  node.width = Math.max(CARD_WIDTH, children);
  return node.width;
}

/** Each card sits centered over its roots. */
function place(node: TreeNode, left: number): void {
  node.x = left + node.width / 2;
  const children = node.children.reduce((sum, child) => sum + child.width, 0) + GAP_X * Math.max(0, node.children.length - 1);
  let at = left + (node.width - children) / 2;
  for (const child of node.children) {
    place(child, at);
    at += child.width + GAP_X;
  }
}

function flatten(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** Draws the map in `container`. `open` is called when a root is tapped. */
export function renderMap(container: HTMLElement, name: string, nodes: MapNode[], activeId: string | null, open: (id: string) => void): void {
  const tree = buildTree(name, nodes);
  const all = flatten(tree);
  const canvas = document.createElement("div");
  canvas.className = "roots-canvas";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("roots-lines");
  svg.setAttribute("aria-hidden", "true");
  canvas.appendChild(svg);

  const cards = new Map<TreeNode, HTMLElement>();
  for (const node of all) {
    const card = node.id === null ? projectCard(node) : rootCard(node, node.id === activeId, open);
    card.style.left = `${node.x - CARD_WIDTH / 2}px`;
    card.style.width = `${CARD_WIDTH}px`;
    card.style.setProperty("--level", String(node.level));
    canvas.appendChild(card);
    cards.set(node, card);
  }
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "roots-empty";
    empty.textContent = t("roots.empty");
    canvas.appendChild(empty);
  }
  container.replaceChildren(canvas);

  // Each level starts below the tallest card of the level above.
  const levels = Math.max(...all.map((n) => n.level)) + 1;
  const heights = new Array<number>(levels).fill(0);
  for (const [node, card] of cards) heights[node.level] = Math.max(heights[node.level], card.offsetHeight);
  const tops: number[] = [];
  for (let level = 0, y = 0; level < levels; level++) {
    tops.push(y);
    y += heights[level] + GAP_Y;
  }
  for (const [node, card] of cards) card.style.top = `${tops[node.level]}px`;
  const width = tree.width;
  const height = tops[levels - 1] + heights[levels - 1];
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  // The lines go down like roots: soft curves from each card to the ones born from it.
  for (const node of all) {
    const from = cards.get(node)!;
    for (const child of node.children) {
      const x1 = node.x;
      const y1 = tops[node.level] + from.offsetHeight;
      const x2 = child.x;
      const y2 = tops[child.level];
      const middle = (y1 + y2) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`);
      path.setAttribute("pathLength", "1");
      path.style.setProperty("--level", String(child.level));
      svg.appendChild(path);
    }
  }
  // The open root stays in view.
  const current = container.querySelector<HTMLElement>(".root-card.current");
  if (current) container.scrollLeft = Math.max(0, current.offsetLeft - container.clientWidth / 2 + CARD_WIDTH / 2);
  else container.scrollLeft = Math.max(0, (width - container.clientWidth) / 2);
}

function projectCard(node: TreeNode): HTMLElement {
  const card = document.createElement("div");
  card.className = "root-card project";
  const title = document.createElement("strong");
  title.textContent = node.title;
  card.appendChild(title);
  return card;
}

function rootCard(node: TreeNode, current: boolean, open: (id: string) => void): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "root-card";
  card.classList.toggle("current", current);
  card.classList.toggle("note", node.kind === "note");
  const title = document.createElement("strong");
  title.textContent = node.title;
  card.appendChild(title);
  const list = document.createElement("span");
  list.className = "root-assumptions";
  if (!node.assumptions.length) {
    const none = document.createElement("span");
    none.className = "root-none";
    none.textContent = t("roots.noAssumptions");
    list.appendChild(none);
  }
  for (const assumption of node.assumptions.slice(0, MAX_CHIPS)) {
    const chip = document.createElement("span");
    chip.className = `assumption-chip ${assumption.state}`;
    chip.title = stateLabel(assumption.state);
    chip.textContent = assumption.text || "…";
    list.appendChild(chip);
  }
  if (node.assumptions.length > MAX_CHIPS) {
    const more = document.createElement("span");
    more.className = "root-none";
    more.textContent = t("roots.more", { count: node.assumptions.length - MAX_CHIPS });
    list.appendChild(more);
  }
  card.appendChild(list);
  card.addEventListener("click", () => open(node.id!));
  return card;
}

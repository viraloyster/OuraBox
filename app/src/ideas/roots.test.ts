import { describe, expect, it } from "vitest";
import { buildTree } from "./roots";
import type { MapNode } from "../core/storage";

const node = (id: string, parent: string | null): MapNode => ({ id, title: id, parent, kind: "file", assumptions: [] });

describe("roots map", () => {
  it("hangs every root from the one it was born from", () => {
    const tree = buildTree("Project", [node("a", null), node("b", "a"), node("c", "b"), node("d", null), node("e", "gone")]);
    expect(tree.children.map((n) => n.id)).toEqual(["a", "d", "e"]);
    expect(tree.children[0].children[0].children[0].id).toBe("c");
    expect(tree.children[0].children[0].children[0].level).toBe(3);
  });

  it("centers each card over its roots without overlapping", () => {
    const tree = buildTree("Project", [node("a", null), node("b", "a"), node("c", "a"), node("d", null)]);
    const [a, d] = tree.children;
    const [b, c] = a.children;
    expect(a.x).toBeCloseTo((b.x + c.x) / 2);
    expect(c.x - b.x).toBeGreaterThanOrEqual(220);
    expect(d.x - c.x).toBeGreaterThanOrEqual(220);
    expect(tree.x).toBeCloseTo(tree.width / 2);
  });

  it("never loops, even with a broken parent chain", () => {
    const tree = buildTree("Project", [node("a", "b"), node("b", "a")]);
    expect(tree.children).toEqual([]);
  });
});

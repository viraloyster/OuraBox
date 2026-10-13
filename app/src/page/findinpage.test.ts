import { describe, expect, it } from "vitest";
import { findAll, findInElement, foldText } from "./findinpage";

describe("find in page", () => {
  it("ignores accents and case without moving positions", () => {
    expect(foldText("Café ÁRBOL")).toBe("cafe arbol");
    expect(findAll("El café y otro Cafe", "cafe")).toEqual([3, 15]);
    expect(findAll("nada", "  ")).toEqual([]);
  });

  it("finds matches that cross formatting", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Una <b>ide</b>a buena</p><p>Otra idea</p>";
    const matches = findInElement(root, "idea");
    expect(matches).toHaveLength(2);
    expect(matches[0].range.toString()).toBe("idea");
    expect(matches[1].range.toString()).toBe("idea");
    expect(matches[0].snippet.slice(matches[0].start, matches[0].end)).toBe("idea");
    // Paragraphs don't run together in the snippet.
    expect(matches[0].snippet).toContain("buena Otra");
  });
});

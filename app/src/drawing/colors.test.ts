import { beforeEach, describe, expect, it } from "vitest";
import { MAX_FAVORITES, addFavorite, hexToHsv, hsvToHex, isColor, loadFavorites, loadPencil, parseHex, removeFavorite, saveFavorites, savePencil } from "./colors";

describe("pencil colors", () => {
  beforeEach(() => localStorage.clear());

  it("starts with the palette and keeps up to 21 favorites", () => {
    expect(loadFavorites()).toEqual(["ink", "agua", "coral", "sol", "alga", "crepusculo"]);
    let colors: string[] = [];
    for (let i = 0; i < 30; i++) colors = addFavorite(colors, `#0000${i.toString(16).padStart(2, "0")}`);
    expect(colors).toHaveLength(MAX_FAVORITES);
    expect(addFavorite(["#AABBCC"], "#aabbcc")).toEqual(["#AABBCC"]);
    expect(removeFavorite(["#aabbcc", "agua"], "#AABBCC")).toEqual(["agua"]);
  });

  it("ignores anything that is not a color", () => {
    expect(isColor("#12abef")).toBe(true);
    expect(isColor("coral")).toBe(true);
    expect(isColor("red; background:url(x)")).toBe(false);
    localStorage.setItem("ourabox.colors", JSON.stringify(["#ffffff", "javascript:x", 4, "agua", "#FFFFFF"]));
    expect(loadFavorites()).toEqual(["#ffffff", "agua"]);
    saveFavorites(["#000000"]);
    expect(loadFavorites()).toEqual(["#000000"]);
  });

  it("remembers the last color, size and transparency, and the eraser's own", () => {
    const eraser = { eraserSize: 24, eraserOpacity: 1, effect: "watercolor", effectSize: 32, effectStrength: 0.6, shapeSize: 4, shapeOpacity: 1, shapeFill: null, shapeOutline: true };
    expect(loadPencil()).toEqual({ color: "ink", size: 6, opacity: 1, ...eraser });
    const pencil = { color: "#123456", size: 22, opacity: 0.4, eraserSize: 80, eraserOpacity: 0.3, effect: "smudge" as const, effectSize: 50, effectStrength: 0.3, shapeSize: 12, shapeOpacity: 0.5, shapeFill: "#abcdef", shapeOutline: false };
    savePencil(pencil);
    expect(loadPencil()).toEqual(pencil);
    localStorage.setItem("ourabox.pencil", JSON.stringify({ color: "bad", size: 999, opacity: 0, eraserSize: 1, eraserOpacity: 2 }));
    expect(loadPencil()).toEqual({ color: "ink", size: 6, opacity: 1, ...eraser });
    // What was saved before transparency and the eraser's own settings existed still works.
    localStorage.setItem("ourabox.pencil", JSON.stringify({ color: "agua", size: 10 }));
    expect(loadPencil()).toEqual({ color: "agua", size: 10, opacity: 1, ...eraser });
  });
  it("keeps a shape's outline when it has no fill", () => {
    localStorage.setItem("ourabox.pencil", JSON.stringify({ shapeFill: null, shapeOutline: false }));
    expect(loadPencil().shapeOutline).toBe(true);
  });
  it("mixes colors by hue, saturation and brightness", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
    // Round trip without losing the color.
    for (const hex of ["#2b7c8a", "#c2553c", "#7260a6", "#ffffff", "#123456"]) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    expect(parseHex("ABC")).toBe("#aabbcc");
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("  #A1B2C3 ")).toBe("#a1b2c3");
  });
});

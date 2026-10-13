import { describe, expect, it } from "vitest";
import { FONT_SIZES, adoptInlineStyles, parseSize } from "./format";

describe("font size", () => {
  it("reads a size typed by hand, like in Word", () => {
    expect(parseSize("14")).toBe(14);
    expect(parseSize(" 10,6 ")).toBe(11);
    expect(parseSize("500")).toBe(FONT_SIZES.max);
    expect(parseSize("1")).toBe(FONT_SIZES.min);
    expect(parseSize("abc")).toBeNull();
    expect(parseSize("")).toBeNull();
  });
});

describe("bold inside a heading", () => {
  it("keeps the browser's un-bold as an attribute that survives saving", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h1>One <span style="font-weight: normal;">two</span></h1>';
    adoptInlineStyles(root);
    expect(root.innerHTML).toBe('<h1>One <span data-weight="normal">two</span></h1>');
  });
});

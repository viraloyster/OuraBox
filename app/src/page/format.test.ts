import { describe, expect, it } from "vitest";
import { FONT_SIZES, adoptInlineStyles, liftList, parseSize } from "./format";

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

describe("a list made on an empty paragraph", () => {
  // Built node by node: the HTML parser would never put a list inside a
  // paragraph, but the browser's list command does.
  function paragraphWithList(before: string, after: string) {
    const editor = document.createElement("div");
    editor.innerHTML = "<p>Hello</p>";
    const paragraph = document.createElement("p");
    if (before) paragraph.append(before);
    const list = document.createElement("ul");
    list.setAttribute("data-list", "check");
    list.innerHTML = "<li>item</li>";
    paragraph.append(list);
    if (after) paragraph.append(after);
    else paragraph.append(document.createElement("br"));
    editor.append(paragraph);
    return { editor, list };
  }

  it("comes out of the paragraph, without empty paragraphs left around it", () => {
    const { editor, list } = paragraphWithList("", "");
    liftList(list, editor);
    expect(editor.innerHTML).toBe('<p>Hello</p><ul data-list="check"><li>item</li></ul>');
  });

  it("keeps what was beside it in paragraphs of their own", () => {
    const { editor, list } = paragraphWithList("before", "after");
    liftList(list, editor);
    expect(editor.innerHTML).toBe('<p>Hello</p><p>before</p><ul data-list="check"><li>item</li></ul><p>after</p>');
  });
});

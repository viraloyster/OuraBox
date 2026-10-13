import { describe, expect, it } from "vitest";
import { isSafeImageSrc, sanitizeHtml } from "./sanitize";

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

describe("sanitizeHtml", () => {
  it("keeps the formatting the editor uses", () => {
    const html = "<h1>Idea</h1><p><b>one</b> <i>two</i> <u>three</u></p><ul><li>a</li></ul>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("removes scripts and their content", () => {
    expect(sanitizeHtml("<p>hello</p><script>alert(1)</script>")).toBe("<p>hello</p>");
  });

  it("removes every attribute, including event handlers and styles", () => {
    expect(sanitizeHtml('<p onclick="x()" style="color:red" class="a">hello</p>')).toBe("<p>hello</p>");
  });

  it("keeps embedded images and drops their other attributes", () => {
    expect(sanitizeHtml(`<img src="${PIXEL}" onerror="x()">`)).toBe(`<img src="${PIXEL}">`);
  });

  it("drops images that point anywhere else", () => {
    expect(sanitizeHtml('<img src="https://example.com/a.png">')).toBe("");
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe("");
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).toBe("");
  });

  it("keeps references to images saved apart, and only valid ones", () => {
    const id = "a".repeat(64);
    expect(sanitizeHtml(`<img data-asset="${id}" onerror="x()">`)).toBe(`<img data-asset="${id}">`);
    expect(sanitizeHtml('<img data-asset="../vault">')).toBe("");
  });

  it("unwraps unknown tags but keeps their text", () => {
    expect(sanitizeHtml('<p><a href="javascript:x()">link</a></p>')).toBe("<p>link</p>");
  });

  it("drops dangerous containers entirely", () => {
    expect(sanitizeHtml('<iframe src="x"></iframe><svg><script>x</script></svg><p>ok</p>')).toBe("<p>ok</p>");
  });
});

describe("isSafeImageSrc", () => {
  it("accepts only base64 raster images", () => {
    expect(isSafeImageSrc(PIXEL)).toBe(true);
    expect(isSafeImageSrc("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(isSafeImageSrc("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(isSafeImageSrc(`${PIXEL}"><script>`)).toBe(false);
  });
});

describe("root links", () => {
  it("keeps the id of a root, and nothing else", () => {
    const id = "a".repeat(32);
    expect(sanitizeHtml(`<span data-root="${id}" onclick="x()" style="color:red">phrase</span>`)).toBe(
      `<span data-root="${id}" class="root-link">phrase</span>`,
    );
    expect(sanitizeHtml(`<span data-root="../x">phrase</span>`)).toBe("<span>phrase</span>");
    expect(sanitizeHtml(`<p data-root="${id}">not this</p>`)).toBe("<p>not this</p>");
  });
  it("keeps the closed set of formatting attributes and nothing else", () => {
    const html =
      '<p data-align="center"><span data-size="large">a</span><span data-color="coral">b</span></p>' +
      '<ul data-list="check"><li data-checked="true">c</li></ul><hr>' +
      '<table><tbody><tr><th>x</th><td data-formula="=SUMA(A1:A2)">3</td></tr></tbody></table>' +
      '<p><span data-size="14">d</span><span data-outline="medio">e</span><span data-outline-color="coral">f</span>' +
      '<span data-hollow="true" spellcheck="false">g</span><strike>h</strike></p><div data-space="1056"></div>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("turns off spell-checking in hollow letters", () => {
    expect(sanitizeHtml('<span data-hollow="true">g</span>')).toBe('<span data-hollow="true" spellcheck="false">g</span>');
    expect(sanitizeHtml('<span spellcheck="false">g</span>')).toBe("<span>g</span>");
  });

  it("drops formatting attributes with unknown values or in the wrong place", () => {
    expect(sanitizeHtml('<p data-align="url(x)" data-size="large">a</p>')).toBe("<p>a</p>");
    expect(sanitizeHtml('<span data-color="#f00">a</span>')).toBe("<span>a</span>");
    expect(sanitizeHtml('<span data-size="200" data-outline="9px">a</span>')).toBe("<span>a</span>");
    expect(sanitizeHtml('<p data-space="10">a</p><div data-space="1e9"></div>')).toBe("<p>a</p><div></div>");
    expect(sanitizeHtml('<td data-formula="=1+1<script>">1</td>')).toBe("1");
    expect(sanitizeHtml('<table><tbody><tr><td data-formula="=1&quot; onclick=&quot;x">1</td></tr></tbody></table>')).toBe(
      "<table><tbody><tr><td>1</td></tr></tbody></table>",
    );
  });
});

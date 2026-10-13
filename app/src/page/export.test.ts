import { describe, expect, it } from "vitest";
import { toMarkdown } from "./export";

describe("Markdown", () => {
  it("keeps line breaks inside tables, quotes and list items where they belong", () => {
    const md = toMarkdown("<table><tbody><tr><th>x<br>y</th><th>z</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>");
    expect(md).toContain("| x<br>y | z |");
    expect(toMarkdown("<blockquote>a<br>b</blockquote>")).toBe("> a\n> b\n");
    expect(toMarkdown("<ul><li>a<br>b</li></ul>")).toBe("- a\n  b\n");
  });

  it("puts spaces outside the emphasis marks", () => {
    expect(toMarkdown("<p><b>bold </b>goes on <s>struck</s></p>")).toBe("**bold** goes on ~~struck~~\n");
  });
});

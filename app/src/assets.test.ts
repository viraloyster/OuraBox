import { describe, expect, it } from "vitest";
import { htmlForSaving } from "./assets";

describe("htmlForSaving", () => {
  it("keeps only the reference of images saved apart", () => {
    const id = "b".repeat(64);
    const container = document.createElement("div");
    container.innerHTML = `<p>Hello</p><img data-asset="${id}" src="data:image/png;base64,AAAA">`;
    expect(htmlForSaving(container)).toBe(`<p>Hello</p><img data-asset="${id}">`);
    // The visible page does not change.
    expect(container.querySelector("img")!.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });
});

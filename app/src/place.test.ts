import { beforeEach, describe, expect, it } from "vitest";
import { caretOffset, forgetPlace, forgetUserScope, placeCaret, readPlace, readWorkspace, rememberPlace, rememberWorkspace, setUserScope } from "./place";

describe("place", () => {
  beforeEach(() => localStorage.clear());

  it("remembers where each document was left", () => {
    rememberPlace("a", { scroll: 420, left: 30, zoom: 1.25, caret: 12 });
    expect(readPlace("a")).toEqual({ scroll: 420, left: 30, zoom: 1.25, caret: 12 });
    expect(readPlace("b")).toBeNull();
    forgetPlace("a");
    expect(readPlace("a")).toBeNull();
  });

  it("keeps only the most recent documents", () => {
    for (let i = 0; i < 305; i++) rememberPlace(`d${i}`, { scroll: i, left: 0, zoom: 1, caret: null });
    expect(readPlace("d0")).toBeNull();
    expect(readPlace("d304")?.scroll).toBe(304);
  });

  it("ignores damaged data", () => {
    localStorage.setItem("ourabox.places", "{not json");
    expect(readPlace("a")).toBeNull();
    localStorage.setItem("ourabox.workspace", JSON.stringify({ open: [1, "x", "y", "z", "w", "v"], active: 7, ratios: [0.5, "x"] }));
    expect(readWorkspace()).toEqual({ open: ["x", "y", "z", "w"], active: 0, ratios: undefined, sidebarHidden: false });
  });

  it("remembers the workspace", () => {
    rememberWorkspace({ open: ["a", "b", "c"], active: 2, ratios: [0.4, 0.3, 0.3], sidebarHidden: true });
    expect(readWorkspace()).toEqual({ open: ["a", "b", "c"], active: 2, ratios: [0.4, 0.3, 0.3], sidebarHidden: true });
  });

  it("forgets everything a deleted user left on this computer", () => {
    setUserScope("ana");
    rememberWorkspace({ open: ["a"], active: 0, sidebarHidden: false });
    rememberPlace("a", { scroll: 1, left: 0, zoom: 1, caret: null });
    setUserScope("beto");
    rememberWorkspace({ open: ["b"], active: 0, sidebarHidden: false });
    localStorage.setItem("ourabox.autolock", "5");
    forgetUserScope("ana");
    expect(Object.keys(localStorage).sort()).toEqual(["ourabox.autolock", "ourabox.workspace:beto"]);
    expect(readWorkspace()?.open).toEqual(["b"]);
    setUserScope(null);
  });

  it("puts the caret back at the same character", () => {
    const editor = document.createElement("div");
    editor.innerHTML = "<h1>Title</h1><p>Hello <b>world</b> blue</p>";
    document.body.appendChild(editor);
    placeCaret(editor, 9);
    expect(caretOffset(editor)).toBe(9);
    placeCaret(editor, 999);
    expect(caretOffset(editor)).toBe(editor.textContent.length);
    editor.remove();
  });
});

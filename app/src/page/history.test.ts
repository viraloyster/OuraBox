import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_MS, History, type TextState } from "./history";

/** A document with text and a drawing that counts its strokes. */
function documentWithHistory() {
  const doc = { text: "", strokes: 0, undoneStrokes: 0 };
  const state = (): TextState => ({ html: doc.text, boxes: "[]" });
  const history = new History({
    readText: state,
    writeText: (s) => (doc.text = s.html),
    undoInk: () => {
      doc.strokes--;
      doc.undoneStrokes++;
    },
    redoInk: () => {
      doc.strokes++;
      doc.undoneStrokes--;
    },
    forgetInkRedo: () => (doc.undoneStrokes = 0),
  });
  history.reset();
  const type = (text: string) => {
    doc.text += text;
    history.textChanged();
  };
  const draw = () => {
    doc.strokes++;
    doc.undoneStrokes = 0;
    history.inkChanged();
  };
  return { doc, history, type, draw };
}

describe("one history for writing and drawing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("undoes the last thing done, written or drawn", () => {
    const { doc, history, type, draw } = documentWithHistory();
    type("Hola");
    draw();
    type(" mundo");
    history.undo();
    expect(doc).toMatchObject({ text: "Hola", strokes: 1 });
    history.undo();
    expect(doc).toMatchObject({ text: "Hola", strokes: 0 });
    history.undo();
    expect(doc).toMatchObject({ text: "", strokes: 0 });
    expect(history.undo()).toBe(false);
  });

  it("redoes in the same order", () => {
    const { doc, history, type, draw } = documentWithHistory();
    draw();
    type("a");
    history.undo();
    history.undo();
    history.redo();
    expect(doc).toMatchObject({ text: "", strokes: 1 });
    history.redo();
    expect(doc).toMatchObject({ text: "a", strokes: 1 });
  });

  it("undoes text typed in one go at once, and after a pause in steps", () => {
    const { doc, history, type } = documentWithHistory();
    type("u");
    type("na");
    vi.advanceTimersByTime(GROUP_MS + 1);
    type(" idea");
    history.undo();
    expect(doc.text).toBe("una");
    history.undo();
    expect(doc.text).toBe("");
  });

  it("forgets what could be redone once something new is done", () => {
    const { doc, history, type, draw } = documentWithHistory();
    draw();
    history.undo();
    type("x");
    expect(doc.undoneStrokes).toBe(0);
    expect(history.redo()).toBe(false);
  });
});

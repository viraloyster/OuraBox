// One undo for the whole document: what was written and what was drawn, in
// the order it was done. Ctrl+Z undoes the last thing, whatever the mode.
//
// The drawing keeps its own changes (see `Ink`): here each one is only a
// mark in the line. The text is kept as it was before each group of changes:
// a pause closes the group, so a sentence typed in one go is undone at once,
// not letter by letter.

/** How the text was: the page's HTML and its text boxes. */
export interface TextState {
  html: string;
  boxes: string;
}

/** What the history acts on. */
export interface HistoryTarget {
  readText(): TextState;
  writeText(state: TextState): void;
  undoInk(): void;
  redoInk(): void;
  /** A new change: what the drawing had undone can no longer be redone. */
  forgetInkRedo(): void;
}

type Step = { kind: "ink" } | { kind: "text"; before: TextState; after?: TextState };

/** A pause this long (in ms) closes a group of text changes. */
export const GROUP_MS = 800;
/** Enough to go back a long way, without keeping the whole day in memory. */
const MAX_STEPS = 300;

export class History {
  private done: Step[] = [];
  private undone: Step[] = [];
  /** How the text was when the last group closed: where the next one starts. */
  private base: TextState | null = null;
  private grouping = false;
  private timer = 0;

  constructor(private target: HistoryTarget) {}

  /** Starts over: another document, or its pages changed. */
  reset(): void {
    clearTimeout(this.timer);
    this.done = [];
    this.undone = [];
    this.grouping = false;
    this.base = this.target.readText();
  }

  /** The text changed by itself (an image was moved to its own file): that is
   *  not a change the person made, it is the new starting point. */
  rebase(): void {
    if (!this.grouping) this.base = this.target.readText();
  }

  /** The text just changed (it already did: the state before is `base`). */
  textChanged(): void {
    if (!this.grouping) {
      this.base ??= this.target.readText();
      this.push({ kind: "text", before: this.base });
      this.grouping = true;
    }
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.close(), GROUP_MS);
  }

  /** The drawing just recorded a change. */
  inkChanged(): void {
    this.close();
    this.push({ kind: "ink" });
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  undo(): boolean {
    this.close();
    const step = this.done.pop();
    if (!step) return false;
    if (step.kind === "ink") {
      this.target.undoInk();
      this.undone.push(step);
    } else {
      const after = this.target.readText();
      this.target.writeText(step.before);
      this.base = step.before;
      this.undone.push({ ...step, after });
    }
    return true;
  }

  redo(): boolean {
    this.close();
    const step = this.undone.pop();
    if (!step) return false;
    if (step.kind === "ink") this.target.redoInk();
    else if (step.after) {
      this.target.writeText(step.after);
      this.base = step.after;
    }
    this.done.push(step);
    return true;
  }

  private push(step: Step): void {
    this.done.push(step);
    if (this.done.length > MAX_STEPS) this.done.shift();
    if (this.undone.length) {
      this.undone = [];
      if (step.kind === "text") this.target.forgetInkRedo();
    }
  }

  /** Ends the group of text changes in progress, if any. */
  private close(): void {
    clearTimeout(this.timer);
    if (!this.grouping) return;
    this.grouping = false;
    this.base = this.target.readText();
  }
}

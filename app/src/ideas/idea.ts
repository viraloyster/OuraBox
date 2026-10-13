// "About this idea": the side panel of each document. It is closed by
// default: structure appears when the person invites it, never before.
//
// - What I want to achieve: the why, which survives even if the how changes.
// - Next step: just one, the antidote to overwhelm.
// - What are you taking for granted?: the box, without verdicts.
// - Attempts: other paths toward the same why.
// - History: how the idea grew.

import { formatDate, t } from "../core/i18n";
import type { Pane } from "../page/pane";
import { storage, type AssumptionState, type Snapshot } from "../core/storage";

const STATES: AssumptionState[] = ["accept", "break", "unknown"];

export type IdeaSection = "purpose" | "next" | "assumptions";

export class IdeaPanel {
  readonly root: HTMLElement;
  onToggle: (open: boolean) => void = () => {};

  private purpose: HTMLTextAreaElement;
  private next: HTMLTextAreaElement;
  private assumptions: HTMLUListElement;
  private newAssumption: HTMLInputElement;
  private attempts: HTMLElement;
  private history: HTMLElement;
  private snapshots: Snapshot[] = [];

  constructor(private pane: Pane) {
    this.root = document.createElement("aside");
    this.root.className = "idea";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", t("idea.title"));
    this.root.innerHTML = `
      <div class="idea-header">
        <h3>${t("idea.title")}</h3>
        <button class="icon-button idea-close" aria-label="${t("idea.close")}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <label class="idea-section">
        <span class="idea-label">${t("idea.purpose")}</span>
        <textarea class="idea-purpose" rows="3" placeholder="${t("idea.purposePlaceholder")}"></textarea>
      </label>
      <label class="idea-section">
        <span class="idea-label">${t("idea.next")}</span>
        <textarea class="idea-next" rows="1" placeholder="${t("idea.nextPlaceholder")}"></textarea>
      </label>
      <section class="idea-section">
        <span class="idea-label">${t("idea.assumptions")}</span>
        <ul class="idea-assumptions"></ul>
        <input class="idea-new-assumption" type="text" placeholder="${t("idea.newAssumption")}" />
      </section>
      <section class="idea-section idea-attempts"></section>
      <section class="idea-section idea-history"></section>`;

    this.purpose = this.root.querySelector(".idea-purpose")!;
    this.next = this.root.querySelector(".idea-next")!;
    this.assumptions = this.root.querySelector(".idea-assumptions")!;
    this.newAssumption = this.root.querySelector(".idea-new-assumption")!;
    this.attempts = this.root.querySelector(".idea-attempts")!;
    this.history = this.root.querySelector(".idea-history")!;

    this.root.querySelector(".idea-close")!.addEventListener("click", () => this.close());
    this.purpose.addEventListener("input", () => this.update((d) => (d.purpose = this.purpose.value)));
    // The next step is a single line of thought, but a long one must be read
    // whole: the field grows with it instead of hiding the end. Enter does not
    // start a second line (there is only one step), and a pasted line break
    // becomes a space.
    this.next.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });
    this.next.addEventListener("input", () => {
      if (/[\r\n]/.test(this.next.value)) this.next.value = this.next.value.replace(/\s*[\r\n]+\s*/g, " ");
      this.fitNext();
      this.update((d) => (d.nextStep = this.next.value.trim()));
      this.pane.renderNextStep();
    });
    this.newAssumption.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !this.newAssumption.value.trim()) return;
      e.preventDefault();
      this.update((d) => d.assumptions.push({ text: this.newAssumption.value.trim(), state: "unknown" }));
      this.newAssumption.value = "";
      this.renderAssumptions();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(focus?: IdeaSection): void {
    if (!this.pane.document) return;
    this.root.hidden = false;
    this.onToggle(true);
    this.render();
    const target = focus === "next" ? this.next : focus === "assumptions" ? this.newAssumption : focus === "purpose" ? this.purpose : null;
    target?.focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.pane.endPreview();
    this.root.hidden = true;
    this.onToggle(false);
  }

  /** Repaints the panel with the pane's document. */
  render(): void {
    const document = this.pane.document;
    if (!document) {
      this.close();
      return;
    }
    if (this.root.hidden) return;
    if (this.purpose.value !== document.purpose) this.purpose.value = document.purpose;
    if (this.next.value.trim() !== document.nextStep) this.next.value = document.nextStep;
    this.fitNext();
    this.renderAssumptions();
    this.renderAttempts();
    this.renderHistoryEntry();
  }

  /** As tall as its text: measured from nothing each time, so it also shrinks. */
  private fitNext(): void {
    this.next.style.height = "auto";
    this.next.style.height = `${this.next.scrollHeight + this.next.offsetHeight - this.next.clientHeight}px`;
  }

  private update(change: (document: NonNullable<Pane["document"]>) => void): void {
    if (!this.pane.document || this.pane.previewing) return;
    change(this.pane.document);
    this.pane.scheduleSave();
  }

  // ---------- The box ----------

  private renderAssumptions(): void {
    const list = this.pane.document?.assumptions ?? [];
    this.assumptions.replaceChildren(
      ...list.map((assumption, index) => {
        const item = document.createElement("li");
        item.className = `assumption ${assumption.state}`;
        const text = document.createElement("span");
        text.className = "assumption-text";
        text.textContent = assumption.text;

        const states = document.createElement("div");
        states.className = "assumption-states";
        states.setAttribute("role", "radiogroup");
        states.setAttribute("aria-label", t("idea.whatToDo", { text: assumption.text }));
        for (const state of STATES) {
          const button = document.createElement("button");
          button.setAttribute("role", "radio");
          button.setAttribute("aria-checked", String(assumption.state === state));
          button.title = t(`idea.stateHints.${state}`);
          button.textContent = t(`idea.states.${state}`);
          button.addEventListener("click", () => {
            this.update((d) => (d.assumptions[index].state = state));
            this.renderAssumptions();
          });
          states.appendChild(button);
        }

        const remove = document.createElement("button");
        remove.className = "assumption-remove";
        remove.setAttribute("aria-label", t("idea.remove", { text: assumption.text }));
        remove.textContent = "×";
        remove.addEventListener("click", () => {
          this.update((d) => d.assumptions.splice(index, 1));
          this.renderAssumptions();
        });
        item.append(text, remove, states);
        return item;
      }),
    );
  }

  // ---------- Attempts ----------

  /** The list of attempts, without touching the fields the person may be typing in. */
  renderAttempts(): void {
    const document_ = this.pane.document;
    if (!document_ || this.root.hidden) return;
    const root = document_.root ?? document_.id;
    const attempts = this.pane.events
      .summaries()
      .filter((s) => s.id === root || s.root === root)
      .sort((a, b) => a.createdAt - b.createdAt);

    const label = document.createElement("span");
    label.className = "idea-label";
    label.textContent = t("idea.attempts");
    const parts: HTMLElement[] = [label];

    if (attempts.length > 1) {
      const list = document.createElement("ol");
      list.className = "attempts";
      attempts.forEach((attempt, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.className = "attempt";
        button.classList.toggle("current", attempt.id === document_.id);
        button.textContent = `${index + 1}. ${attempt.title || t("idea.untitled")}`;
        button.addEventListener("click", () => this.pane.events.open(this.pane, attempt.id));
        item.appendChild(button);
        list.appendChild(item);
      });
      parts.push(list);
    } else {
      const hint = document.createElement("p");
      hint.className = "idea-hint";
      hint.textContent = t("idea.attemptsHint");
      parts.push(hint);
    }
    const create = document.createElement("button");
    create.className = "idea-button";
    create.textContent = t("idea.newAttempt");
    create.title = t("idea.newAttemptHint");
    create.addEventListener("click", () => this.pane.events.newAttempt(this.pane));
    parts.push(create);
    this.attempts.replaceChildren(...parts);
  }

  // ---------- History ----------

  private renderHistoryEntry(): void {
    const label = document.createElement("span");
    label.className = "idea-label";
    label.textContent = t("idea.history");
    const button = document.createElement("button");
    button.className = "idea-button";
    button.textContent = t("idea.seeHistory");
    button.addEventListener("click", () => void this.openHistory());
    this.history.replaceChildren(label, button);
  }

  private async openHistory(): Promise<void> {
    const document_ = this.pane.document;
    if (!document_) return;
    await this.pane.flushSave();
    this.snapshots = await storage.history(document_.id);
    const label = document.createElement("span");
    label.className = "idea-label";
    label.textContent = t("idea.history");

    if (this.snapshots.length < 2) {
      const hint = document.createElement("p");
      hint.className = "idea-hint";
      hint.textContent = t("idea.noHistory");
      const back = document.createElement("button");
      back.className = "idea-button";
      back.textContent = t("idea.gotIt");
      back.addEventListener("click", () => this.renderHistoryEntry());
      this.history.replaceChildren(label, hint, back);
      return;
    }

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "history-slider";
    slider.min = "0";
    slider.max = String(this.snapshots.length - 1);
    slider.value = slider.max;
    slider.setAttribute("aria-label", t("idea.version"));
    const when = document.createElement("p");
    when.className = "history-when";

    const restore = document.createElement("button");
    restore.className = "idea-button";
    restore.textContent = t("idea.restore");
    restore.title = t("idea.restoreHint");
    const present = document.createElement("button");
    present.className = "idea-button quiet";
    present.textContent = t("idea.present");

    let shown: Awaited<ReturnType<typeof storage.loadSnapshot>> | null = null;
    const showAt = async (index: number) => {
      const snapshot = this.snapshots[index];
      when.textContent = formatMoment(snapshot.updatedAt);
      shown = await storage.loadSnapshot(document_.id, snapshot.name);
      // If another document was opened in the meantime, this version no longer applies.
      if (slider.value === String(index) && this.pane.document?.id === document_.id && slider.isConnected) await this.pane.preview(shown);
    };
    slider.addEventListener("input", () => void showAt(Number(slider.value)));
    restore.addEventListener("click", () => {
      if (!shown) return;
      this.pane.restore(shown);
      this.renderHistoryEntry();
    });
    present.addEventListener("click", () => {
      this.pane.endPreview();
      this.renderHistoryEntry();
    });

    this.history.replaceChildren(label, slider, when, restore, present);
    this.history.scrollIntoView({ block: "nearest", behavior: "smooth" });
    slider.focus({ preventScroll: true });
    await showAt(this.snapshots.length - 1);
  }
}

function formatMoment(millis: number): string {
  return formatDate(millis, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

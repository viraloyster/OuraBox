// Ideas that come back: now and then, when OuraBox opens, an idea that has
// stood still appears gently. Ideas ripen on their own; none is forgotten.
//
// Rules, so it never overwhelms:
// - At most once a day, and only when the space is opened. Never as a notification.
// - A single idea.
// - Only ideas that have been still for at least a week, not released or resting.
// - It can be closed without deciding anything.

import { t } from "./i18n";
import { scoped } from "./place";
import type { DocumentSummary } from "./storage";

const DAY = 24 * 60 * 60 * 1000;
/** An idea comes back if nobody touched it for this long. */
export const QUIET_FOR = 7 * DAY;
/** "Let it rest" sets it aside for this long. */
export const REST_FOR = 30 * DAY;
const LAST_SHOWN_KEY = "ourabox.resurfaced";

export interface ResurfaceActions {
  resume(id: string): void;
  rest(id: string): void;
  release(id: string): void;
}

/** The idea that could come back today: the one that has been still the longest. */
export function pickIdea(summaries: DocumentSummary[], now: number, openIds: string[]): DocumentSummary | null {
  const candidates = summaries.filter(
    (s) => !s.released && s.restUntil <= now && now - s.updatedAt >= QUIET_FOR && !openIds.includes(s.id),
  );
  candidates.sort((a, b) => a.updatedAt - b.updatedAt);
  return candidates[0] ?? null;
}

/** "3 weeks ago", "2 months ago"… */
export function timeAgo(millis: number, now: number): string {
  const days = Math.floor((now - millis) / DAY);
  if (days < 14) return t("resurface.days", { count: days });
  if (days < 60) return t("resurface.weeks", { count: Math.floor(days / 7) });
  if (days < 730) return t("resurface.months", { count: Math.floor(days / 30) });
  return t("resurface.years", { count: Math.floor(days / 365) });
}

function shownToday(now: number): boolean {
  try {
    return localStorage.getItem(scoped(LAST_SHOWN_KEY)) === new Date(now).toDateString();
  } catch {
    return true;
  }
}

function markShown(now: number): void {
  try {
    localStorage.setItem(scoped(LAST_SHOWN_KEY), new Date(now).toDateString());
  } catch {
    // Without storage: it is not shown again in this session anyway.
  }
}

let card: HTMLElement | null = null;

export function dismissResurface(): void {
  card?.remove();
  card = null;
}

/** If today is the day, shows an idea that comes back. */
export function maybeResurface(summaries: DocumentSummary[], openIds: string[], actions: ResurfaceActions): void {
  const now = Date.now();
  if (card || shownToday(now)) return;
  const idea = pickIdea(summaries, now, openIds);
  if (!idea) return;
  markShown(now);

  card = document.createElement("aside");
  card.className = "resurface glass";
  card.setAttribute("aria-label", t("resurface.label"));
  const when = document.createElement("p");
  when.className = "resurface-when";
  when.textContent = t("resurface.youWrote", { when: timeAgo(idea.updatedAt, now) });
  const title = document.createElement("p");
  title.className = "resurface-title";
  title.textContent = idea.title || t("resurface.untitled");
  const question = document.createElement("p");
  question.className = "resurface-question";
  question.textContent = t("resurface.question");

  const buttons = document.createElement("div");
  buttons.className = "resurface-actions";
  const choices: Array<[string, string, () => void]> = [
    [t("resurface.resume"), t("resurface.resumeHint"), () => actions.resume(idea.id)],
    [t("resurface.rest"), t("resurface.restHint"), () => actions.rest(idea.id)],
    [t("resurface.release"), t("resurface.releaseHint"), () => actions.release(idea.id)],
  ];
  for (const [label, hint, act] of choices) {
    const button = document.createElement("button");
    button.textContent = label;
    button.title = hint;
    button.addEventListener("click", () => {
      act();
      dismissResurface();
    });
    buttons.appendChild(button);
  }
  const close = document.createElement("button");
  close.className = "icon-button resurface-close";
  close.setAttribute("aria-label", t("resurface.close"));
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>';
  close.addEventListener("click", dismissResurface);

  card.append(close, when, title, question, buttons);
  // It appears calmly, once the person has settled in.
  window.setTimeout(() => card && document.body.appendChild(card), 1500);
}

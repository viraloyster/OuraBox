// The gear: everything that can be set lives in one place (the sky,
// language, security, locking and signing out), like an editor's settings.

import { clearSecurity, renderSecurity } from "./security";
import { renderPicker } from "./sky";

type Tab = "sky" | "language" | "security";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let tab: Tab = "sky";

/** `lock` keeps who was signed in (the door asks only for the password); `signOut` forgets them. */
export function setupSettings(lock: () => void, signOut: () => void): void {
  $("open-settings").addEventListener("click", () => openSettings());
  $("close-settings").addEventListener("click", closeSettings);
  $("settings").addEventListener("click", (e) => {
    if (e.target === $("settings")) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("settings").hidden) {
      e.preventDefault();
      closeSettings();
    }
  });
  for (const button of document.querySelectorAll<HTMLElement>("#settings [data-tab]")) {
    button.addEventListener("click", () => showTab(button.dataset.tab as Tab));
  }
  $("lock-now").addEventListener("click", () => {
    closeSettings();
    lock();
  });
  $("sign-out").addEventListener("click", () => {
    closeSettings();
    signOut();
  });
}

export function openSettings(next: Tab = tab): void {
  showTab(next);
  $("settings").hidden = false;
  // While it is open, what is behind it gets neither focus nor clicks.
  $("app").inert = true;
  $("settings").querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
}

export function closeSettings(): void {
  if ($("settings").hidden) return;
  $("settings").hidden = true;
  if ($("roots").hidden) $("app").inert = false;
  clearSecurity();
  $("open-settings").focus();
}

export function settingsOpen(): boolean {
  return !$("settings").hidden;
}

function showTab(next: Tab): void {
  // When leaving security, what was typed in its forms doesn't stay.
  if (tab === "security" && next !== "security") clearSecurity();
  tab = next;
  for (const button of document.querySelectorAll<HTMLElement>("#settings [data-tab]")) {
    button.setAttribute("aria-selected", String(button.dataset.tab === next));
  }
  for (const section of document.querySelectorAll<HTMLElement>("#settings [data-section]")) {
    section.hidden = section.dataset.section !== next;
  }
  if (next === "sky") renderPicker();
  if (next === "security") renderSecurity();
}

// Security: automatic lock after inactivity, password change and deleting
// the user.

import { t } from "./i18n";
import { checkNewPassword, field, friendly, recoveryExtras } from "./lock";
import { storage } from "./storage";

const AUTOLOCK_KEY = "ourabox.autolock";
/** Minutes without use before locking. 0 means never. */
const AUTOLOCK_OPTIONS = [5, 15, 30, 60, 0];

/** The label of an option, in the current language. */
function autolockLabel(minutes: number): string {
  if (minutes === 0) return t("security.never");
  if (minutes % 60 === 0) return t("security.hours", { count: minutes / 60 });
  return t("security.minutes", { count: minutes });
}
const DEFAULT_AUTOLOCK = 15;
const CHECK_EVERY_MS = 15_000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let lastActivity = Date.now();

export function autolockMinutes(): number {
  try {
    const raw = localStorage.getItem(AUTOLOCK_KEY);
    if (raw !== null && AUTOLOCK_OPTIONS.some((minutes) => String(minutes) === raw)) return Number(raw);
  } catch {
    // No storage: the default value is used.
  }
  return DEFAULT_AUTOLOCK;
}

/** Has the inactivity time passed? It uses the real clock, so the time the
 *  computer was asleep also counts. */
export function shouldAutolock(now: number, last: number, minutes: number): boolean {
  return minutes > 0 && now - last >= minutes * 60_000;
}

/** Watches activity and calls `lock` when the space has gone unused for too long. */
export function startAutolock(lock: () => void): void {
  const touch = () => (lastActivity = Date.now());
  for (const event of ["pointerdown", "pointermove", "keydown", "wheel", "focus"]) {
    window.addEventListener(event, touch, { passive: true, capture: true });
  }
  window.setInterval(() => {
    const open = !document.body.classList.contains("locked");
    if (open && shouldAutolock(Date.now(), lastActivity, autolockMinutes())) lock();
  }, CHECK_EVERY_MS);
}

/** On unlock, the inactivity time starts over. */
export function resetAutolock(): void {
  lastActivity = Date.now();
}

/** Deletes the user who entered, after their password (main.ts closes the space first). */
let deleteUser: (password: string) => Promise<void> = async () => {};

export function setupSecurity(onDelete: (password: string) => Promise<void>): void {
  deleteUser = onDelete;
  $("export-copy").addEventListener("click", () => void exportCopy());
  $("delete-user").addEventListener("click", () => {
    if ($("delete-user-form").hidden) renderDeleteForm();
    else closeDeleteForm();
  });
}

/** When Settings closes, the forms are emptied: the new key does not stay on screen. */
export function clearSecurity(): void {
  $<HTMLFormElement>("password-form").replaceChildren();
  $<HTMLFormElement>("recovery-form").replaceChildren();
  closeDeleteForm();
}

/** An encrypted backup of the whole space, wherever the person wants. */
async function exportCopy(): Promise<void> {
  const button = $<HTMLButtonElement>("export-copy");
  const message = $("export-message");
  message.className = "lock-error";
  message.textContent = "";
  button.disabled = true;
  button.textContent = t("security.exporting");
  try {
    const today = new Date();
    const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
    const name = await storage.exportCopy(`OuraBox ${date}`);
    if (name) {
      message.className = "done";
      message.textContent = t("security.exported", { name });
    }
  } catch (reason) {
    message.textContent = friendly(reason);
  } finally {
    button.disabled = false;
    button.textContent = t("security.export");
  }
}

/** Prepares the Security section of Settings. */
export function renderSecurity(): void {
  $("export-message").textContent = "";
  renderAutolock();
  renderPasswordForm();
  renderRecoveryForm();
}

function renderAutolock(): void {
  const current = autolockMinutes();
  const buttons = AUTOLOCK_OPTIONS.map((minutes) => {
    const button = document.createElement("button");
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(minutes === current));
    button.textContent = autolockLabel(minutes);
    button.addEventListener("click", () => {
      try {
        localStorage.setItem(AUTOLOCK_KEY, String(minutes));
      } catch {
        // Couldn't save: it only lasts while the app is open.
      }
      renderAutolock();
    });
    return button;
  });
  $("autolock-options").replaceChildren(...buttons);
}

/** Deleting the user: what it means, plainly, and the password. The red
 *  button waits until the person says they understand. */
function renderDeleteForm(): void {
  const form = $<HTMLFormElement>("delete-user-form");
  const text = document.createElement("p");
  text.textContent = t("security.deleteText");
  const current = field(t("security.currentPassword"), "password", "current-password");
  const check = document.createElement("label");
  check.className = "check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  check.append(checkbox, document.createTextNode(t("security.deleteUnderstand")));
  const message = document.createElement("p");
  message.className = "lock-error";
  message.setAttribute("role", "alert");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary danger";
  submit.textContent = t("security.deleteSubmit");
  submit.disabled = true;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "link";
  cancel.textContent = t("security.cancel");
  cancel.addEventListener("click", () => {
    closeDeleteForm();
    $("delete-user").focus();
  });
  form.replaceChildren(text, current.element, check, message, submit, cancel);
  form.hidden = false;
  $("delete-user").setAttribute("aria-expanded", "true");
  checkbox.addEventListener("change", () => (submit.disabled = !checkbox.checked));
  current.input.focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!checkbox.checked) return;
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = t("security.deleting");
    try {
      await deleteUser(current.input.value);
    } catch (reason) {
      message.textContent = friendly(reason);
      submit.disabled = !checkbox.checked;
      submit.textContent = t("security.deleteSubmit");
      current.input.focus();
    } finally {
      current.input.value = "";
    }
  };
}

function closeDeleteForm(): void {
  const form = $<HTMLFormElement>("delete-user-form");
  form.hidden = true;
  form.onsubmit = null;
  form.replaceChildren();
  $("delete-user").setAttribute("aria-expanded", "false");
}

function renderRecoveryForm(): void {
  const form = $<HTMLFormElement>("recovery-form");
  const current = field(t("security.currentPassword"), "password", "current-password");
  const message = document.createElement("p");
  message.className = "lock-error";
  message.setAttribute("role", "alert");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = t("security.newKey");
  form.replaceChildren(current.element, message, submit);

  form.onsubmit = async (e) => {
    e.preventDefault();
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = t("security.creating");
    try {
      const code = await storage.newRecoveryCode(current.input.value);
      const box = document.createElement("output");
      box.className = "recovery-code mono";
      box.textContent = code;
      const done = document.createElement("p");
      done.className = "done";
      done.textContent = t("security.newKeyDone");
      form.onsubmit = (event) => event.preventDefault();
      form.replaceChildren(done, box, recoveryExtras(code));
    } catch (reason) {
      message.textContent = friendly(reason);
      submit.disabled = false;
      submit.textContent = t("security.newKey");
    } finally {
      current.input.value = "";
    }
  };
}

function renderPasswordForm(): void {
  const form = $<HTMLFormElement>("password-form");
  const current = field(t("security.currentPassword"), "password", "current-password");
  const next = field(t("security.newPassword"), "password", "new-password");
  const confirm = field(t("security.repeatNewPassword"), "password", "new-password");
  const message = document.createElement("p");
  message.className = "lock-error";
  message.setAttribute("role", "alert");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = t("security.changePassword");
  form.replaceChildren(current.element, next.element, confirm.element, message, submit);

  form.onsubmit = async (e) => {
    e.preventDefault();
    message.textContent = "";
    message.className = "lock-error";
    submit.disabled = true;
    submit.textContent = t("security.changing");
    try {
      const value = checkNewPassword(next.input.value, confirm.input.value);
      await storage.changePassword(current.input.value, value);
      message.className = "done";
      message.textContent = t("security.changed");
    } catch (reason) {
      message.textContent = friendly(reason);
    } finally {
      // The passwords don't stay typed in the form.
      for (const input of [current.input, next.input, confirm.input]) input.value = "";
      submit.disabled = false;
      submit.textContent = t("security.changePassword");
    }
  };
}

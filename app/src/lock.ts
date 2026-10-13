// The door to the safe space: create a user, sign in with username and
// password, and recover access. Each user of the computer has their own
// encrypted space (see src-tauri/src/users.rs).
//
// While it is in view, the app behind it is empty and inert: locking clears
// everything decrypted from the screen.

import { errorText, t } from "./i18n";
import { isAppError, storage } from "./storage";

type View = "create" | "claim" | "unlock" | "locked" | "recover";

const MIN_PASSWORD_CHARS = 8;

const screen = document.getElementById("lock-screen") as HTMLElement;
const card = document.getElementById("lock-card") as HTMLFormElement;

let onOpen: () => void = () => {};
/** Whether there are users already: when creating a new one, you can go back to signing in. */
let hasUsers = false;
/** Who locked the space, like a computer's lock screen: the door then asks
 *  only for their password. Kept in memory only, never saved. */
let lockedUser: string | null = null;

/** Shows the door. `opened` is called once the space is unlocked. The
 *  "locked" view needs `user`, the person who locked it. */
export function showLock(view: View, opened: () => void, usersExist = view === "unlock" || view === "locked", user: string | null = null): void {
  onOpen = opened;
  hasUsers = usersExist;
  lockedUser = view === "locked" ? user : null;
  document.body.classList.add("locked");
  document.getElementById("app")?.setAttribute("inert", "");
  screen.hidden = false;
  render(view);
}

function hideLock(): void {
  screen.hidden = true;
  lockedUser = null;
  document.body.classList.remove("locked");
  document.getElementById("app")?.removeAttribute("inert");
  card.replaceChildren();
  onOpen();
}

function render(view: View): void {
  if (view === "create") renderCreate();
  else if (view === "claim") renderClaim();
  // While someone's space is locked, signing in means coming back to it.
  else if ((view === "unlock" || view === "locked") && lockedUser) renderLocked(lockedUser);
  else if (view === "unlock" || view === "locked") renderUnlock();
  else renderRecover();
}

// ---------- Views ----------

/** The username field. */
function userField(): Required<Field> {
  const user = field(t("lock.username"), "text", "username");
  user.input.maxLength = 40;
  user.input.spellcheck = false;
  user.input.autocapitalize = "off";
  return user;
}

/** A new user on this computer (the first one, or one more). */
function renderCreate(): void {
  const user = userField();
  const password = field(t("lock.password"), "password", "new-password");
  const confirm = field(t("lock.repeatPassword"), "password", "new-password");
  build({
    title: t("lock.create.title"),
    text: t("lock.create.text"),
    fields: [user, password, confirm],
    note: t("lock.create.note", { count: MIN_PASSWORD_CHARS }),
    submit: t("lock.create.submit"),
    busy: t("lock.creating"),
    action: async () => {
      const value = checkNewPassword(password.input.value, confirm.input.value);
      const code = await storage.createVault(user.input.value, value);
      renderRecoveryCode(code);
    },
    alternatives: [
      [t("lock.create.openCopy"), () => void chooseCopy()],
      ...(hasUsers ? ([[t("lock.create.haveUser"), () => render("unlock")]] as Array<[string, () => void]>) : []),
    ],
  });
}

/** The space from before there were users: it gets a name, with the usual password. */
function renderClaim(): void {
  const user = userField();
  const password = field(t("lock.claim.password"), "password", "current-password");
  build({
    title: t("lock.claim.title"),
    text: t("lock.claim.text"),
    fields: [user, password],
    submit: t("lock.signIn"),
    busy: t("lock.signingIn"),
    action: async () => {
      await storage.claimSpace(user.input.value, password.input.value);
      hideLock();
    },
  });
}

/** On a new computer: choose the encrypted backup that was brought over. */
async function chooseCopy(): Promise<void> {
  try {
    const name = await storage.chooseCopy();
    if (name) renderOpenCopy(name);
  } catch (reason) {
    const error = card.querySelector(".lock-error");
    if (error) error.textContent = friendly(reason);
  }
}

function renderOpenCopy(name: string): void {
  const user = userField();
  const password = field(t("lock.password"), "password", "current-password");
  build({
    title: t("lock.copy.title"),
    text: t("lock.copy.text", { name }),
    fields: [user, password],
    submit: t("lock.copy.submit"),
    busy: t("lock.copy.opening"),
    action: async () => {
      await storage.restoreCopy(user.input.value, password.input.value);
      hideLock();
    },
    alternatives: [[t("lock.copy.forgot"), () => renderOpenCopyWithCode(name)]],
  });
}

function renderOpenCopyWithCode(name: string): void {
  const user = userField();
  const code = field(t("lock.recoveryKey"), "text", "off");
  code.input.spellcheck = false;
  code.input.classList.add("mono");
  const password = field(t("lock.newPassword"), "password", "new-password");
  const confirm = field(t("lock.repeatNewPassword"), "password", "new-password");
  build({
    title: t("lock.copy.title"),
    text: t("lock.copy.textWithKey", { name }),
    fields: [user, code, password, confirm],
    submit: t("lock.copy.submit"),
    busy: t("lock.copy.opening"),
    action: async () => {
      const value = checkNewPassword(password.input.value, confirm.input.value);
      await storage.restoreCopy(user.input.value, code.input.value, value);
      hideLock();
    },
    alternatives: [[t("lock.back"), () => renderOpenCopy(name)]],
  });
}

function renderUnlock(): void {
  const user = userField();
  const password = field(t("lock.password"), "password", "current-password");
  build({
    title: t("lock.unlock.title"),
    text: t("lock.unlock.text"),
    fields: [user, password],
    submit: t("lock.signIn"),
    busy: t("lock.signingIn"),
    action: async () => {
      await storage.unlock(user.input.value, password.input.value);
      hideLock();
    },
    alternatives: [
      [t("lock.unlock.forgot"), () => render("recover")],
      [t("lock.unlock.addUser"), () => render("create")],
    ],
  });
}

/** After a lock: the name is known, only the password is missing. */
function renderLocked(name: string): void {
  // For password managers: the username goes with the form, without being shown.
  const user = userField();
  user.input.value = name;
  user.element.hidden = true;
  user.input.hidden = true;
  const password = field(t("lock.password"), "password", "current-password");
  build({
    title: t("lock.locked.title"),
    text: t("lock.locked.text", { name }),
    fields: [user, password],
    submit: t("lock.locked.submit"),
    busy: t("lock.locked.busy"),
    action: async () => {
      await storage.unlock(name, password.input.value).catch((reason: unknown) => {
        // The name is not in doubt here: only the password can be wrong.
        throw isAppError(reason) && reason.key === "wrong_username_or_password" ? { ...reason, key: "wrong_password" } : reason;
      });
      hideLock();
    },
    alternatives: [
      [t("lock.unlock.forgot"), () => render("recover")],
      [
        t("lock.locked.otherUser"),
        () => {
          lockedUser = null;
          render("unlock");
        },
      ],
    ],
  });
}

function renderRecover(): void {
  const user = userField();
  // After a lock, the name is already known.
  if (lockedUser) user.input.value = lockedUser;
  const code = field(t("lock.recoveryKey"), "text", "off");
  code.input.spellcheck = false;
  code.input.classList.add("mono");
  const password = field(t("lock.newPassword"), "password", "new-password");
  const confirm = field(t("lock.repeatNewPassword"), "password", "new-password");
  build({
    title: t("lock.recover.title"),
    text: t("lock.recover.text"),
    fields: [user, code, password, confirm],
    submit: t("lock.recover.submit"),
    busy: t("lock.recover.busy"),
    action: async () => {
      const value = checkNewPassword(password.input.value, confirm.input.value);
      await storage.recover(user.input.value, code.input.value, value);
      hideLock();
    },
    alternatives: [[t("lock.back"), () => render("unlock")]],
  });
}

/** The recovery key is shown only once. */
function renderRecoveryCode(code: string): void {
  const box = document.createElement("output");
  box.className = "recovery-code mono";
  box.textContent = code;

  const check = document.createElement("label");
  check.className = "check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  check.append(checkbox, document.createTextNode(t("lock.code.saved")));

  build({
    title: t("lock.code.title"),
    text: t("lock.code.text"),
    fields: [{ element: box }, { element: recoveryExtras(code) }, { element: check }],
    submit: t("lock.code.submit"),
    busy: t("lock.signingIn"),
    action: async () => hideLock(),
    // The key is shown only once: a reload here would lose it.
    keepLanguage: true,
  });
  const submit = card.querySelector<HTMLButtonElement>("button[type=submit]")!;
  submit.disabled = true;
  checkbox.addEventListener("change", () => (submit.disabled = !checkbox.checked));
}

// ---------- Pieces ----------

/** Next to the recovery key: copy it and, if the person wants, send it to their email. */
export function recoveryExtras(code: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "recovery-extras";
  const row = document.createElement("div");
  row.className = "recovery-actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "link";
  copy.textContent = t("lock.mail.copy");
  copy.addEventListener("click", () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => (copy.textContent = t("lock.mail.copied")))
      .catch(() => (copy.textContent = t("lock.mail.copyFailed")));
  });
  const mail = document.createElement("button");
  mail.type = "button";
  mail.className = "link";
  mail.textContent = t("lock.mail.toggle");
  mail.setAttribute("aria-expanded", "false");
  row.append(copy, mail);

  const panel = document.createElement("div");
  panel.className = "recovery-mail";
  panel.hidden = true;
  const note = document.createElement("p");
  note.className = "lock-note";
  note.textContent = t("lock.mail.note");
  const email = field(t("lock.mail.email"), "email", "email");
  email.input.required = false;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "secondary";
  open.textContent = t("lock.mail.open");
  const message = document.createElement("p");
  message.className = "lock-error";
  message.setAttribute("role", "status");
  open.addEventListener("click", () => {
    message.className = "lock-error";
    message.textContent = "";
    storage
      .openRecoveryMail(email.input.value, code)
      .then(() => {
        message.className = "done";
        // The system accepts the request even when there is no email program: say so honestly.
        message.textContent = t("lock.mail.opened");
      })
      .catch((reason) => (message.textContent = friendly(reason)));
  });
  // Enter in the email field does not submit the door's form.
  email.input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    open.click();
  });
  panel.append(note, email.element, open, message);
  mail.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    mail.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) email.input.focus();
  });
  wrapper.append(row, panel);
  return wrapper;
}

export interface Field {
  element: HTMLElement;
  input?: HTMLInputElement;
}

export function field(label: string, type: string, autocomplete: AutoFill): Required<Field> {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = true;
  wrapper.append(text, input);
  return { element: wrapper, input };
}

interface ViewOptions {
  title: string;
  text: string;
  fields: Field[];
  note?: string;
  submit: string;
  busy: string;
  action: () => Promise<void>;
  alternatives?: Array<[label: string, go: () => void]>;
  /** Hides the language picker: changing it reloads the window, and some views can't be shown again. */
  keepLanguage?: boolean;
}

function build(options: ViewOptions): void {
  const mark = document.createElement("span");
  mark.className = "brand-mark lock-mark";
  mark.setAttribute("aria-hidden", "true");
  const title = document.createElement("h1");
  title.textContent = options.title;
  const text = document.createElement("p");
  text.className = "lock-text";
  text.textContent = options.text;

  const parts: HTMLElement[] = [mark, title, text, ...options.fields.map((f) => f.element)];
  if (options.note) {
    const note = document.createElement("p");
    note.className = "lock-note";
    note.textContent = options.note;
    parts.push(note);
  }
  const error = document.createElement("p");
  error.className = "lock-error";
  error.setAttribute("role", "alert");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = options.submit;
  parts.push(error, submit);

  for (const [label, go] of options.alternatives ?? []) {
    const alt = document.createElement("button");
    alt.type = "button";
    alt.className = "link";
    alt.textContent = label;
    alt.addEventListener("click", go);
    parts.push(alt);
  }

  card.replaceChildren(...parts);
  const language = document.querySelector<HTMLElement>(".lock-language");
  if (language) language.hidden = Boolean(options.keepLanguage);
  card.classList.remove("appear");
  void card.offsetWidth;
  card.classList.add("appear");

  card.onsubmit = async (e) => {
    e.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = options.busy;
    try {
      await options.action();
    } catch (reason) {
      error.textContent = friendly(reason);
      submit.disabled = false;
      submit.textContent = options.submit;
      // Clear the typed passwords so they don't stay in the form.
      for (const input of card.querySelectorAll<HTMLInputElement>("input[type=password]")) input.value = "";
      // The typed username stays: the cursor goes to what is missing.
      const empty = [...card.querySelectorAll<HTMLInputElement>("input:not([hidden])")].find((input) => !input.value);
      (empty ?? card.querySelector<HTMLInputElement>("input:not([hidden])"))?.focus();
    }
  };
  // The first field still empty (after a lock, or in recovery, the name is already there).
  const inputs = [...card.querySelectorAll<HTMLInputElement>("input:not([hidden])")];
  (inputs.find((input) => !input.value) ?? inputs[0])?.focus();
}

/** The new password, or throws the text to show (the forms show a thrown text as it is). */
export function checkNewPassword(password: string, confirm: string): string {
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if ([...password].length < MIN_PASSWORD_CHARS) throw t("lock.tooShort", { count: MIN_PASSWORD_CHARS });
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (password !== confirm) throw t("lock.mismatch");
  return password;
}

/** A calm message for what went wrong at the door, in the person's language. */
export function friendly(reason: unknown): string {
  if (isAppError(reason) && reason.key === "wrong_password") return t("lock.wrongPassword");
  if (isAppError(reason) && reason.key === "wrong_username_or_password") return t("lock.wrongUserOrPassword");
  const message = reason instanceof Error && reason.message ? reason.message : errorText(reason);
  return /[.?!…]$/.test(message) ? message : `${message}.`;
}

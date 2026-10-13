// Choosing the language: in Settings (Language) and on the sign-in screen,
// so someone who doesn't read the system's language can change it before
// creating their space. Each language is written in its own name.

import { LOCALES, changeLocale, currentLocale, type Locale } from "./i18n";

/** Saves what is open, then reloads in the new language. */
async function switchTo(locale: Locale, beforeChange: () => Promise<void>): Promise<void> {
  if (locale === currentLocale()) return;
  try {
    await beforeChange();
  } finally {
    changeLocale(locale);
  }
}

/** The list in Settings: one choice per language, like the reading options. */
export function setupLanguageChoices(container: HTMLElement, beforeChange: () => Promise<void>): void {
  const buttons = LOCALES.map(({ id, name, intl }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.lang = intl;
    button.textContent = name;
    button.setAttribute("aria-checked", String(id === currentLocale()));
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-checked", String(other === button));
      void switchTo(id, beforeChange);
    });
    return button;
  });
  container.replaceChildren(...buttons);
}

/** The small picker on the sign-in screen. Nothing is open there yet. */
export function setupLanguageSelect(select: HTMLSelectElement): void {
  select.replaceChildren(
    ...LOCALES.map(({ id, name, intl }) => {
      const option = new Option(name, id, false, id === currentLocale());
      option.lang = intl;
      return option;
    }),
  );
  select.addEventListener("change", () => void switchTo(select.value as Locale, async () => {}));
}

// Languages. The interface text lives in src/locales/<language>/, one file per
// part of the app. English is the reference: every other language must have
// exactly the same keys (TypeScript checks it, see `Translation`).
//
// Only the chosen language is loaded: each one is its own small chunk, like a
// language pack that ships with the app. Adding a language later means adding
// a folder and a line in LOCALES.
//
// Changing the language reloads the window. Everything is saved first, and the
// space stays unlocked in the core, so the person comes back to the same place.

import type en from "../locales/en";
import { isAppError } from "./storage";

export type Locale = "en" | "es" | "pt";

/** The languages offered, each with its name written in that language. */
export const LOCALES: readonly { id: Locale; name: string; intl: string }[] = [
  { id: "en", name: "English", intl: "en" },
  { id: "es", name: "Español", intl: "es" },
  { id: "pt", name: "Português (Brasil)", intl: "pt-BR" },
];

const STORAGE_KEY = "ourabox.locale";
const FALLBACK: Locale = "en";

/** A text that changes with a number: "1 file" / "3 files". */
export interface Plural {
  one: string;
  other: string;
}

/** The shape another language must have: the same keys as English, any text. */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Translation<T[K]>;
};

type Messages = typeof en;

/** Every key that `t` accepts, like "lock.title". */
type Keys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${Prefix}${K}` : Keys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Keys<Messages>;

export type Params = Record<string, string | number>;

const loaders: Record<Locale, () => Promise<{ default: unknown }>> = {
  en: () => import("../locales/en"),
  es: () => import("../locales/es"),
  pt: () => import("../locales/pt"),
};

let current: Locale = FALLBACK;
let messages: Record<string, unknown> = {};

function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.id === value);
}

function stored(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** The language chosen before, or else the first one of the system that OuraBox speaks. */
export function detectLocale(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Locale {
  const chosen = stored();
  if (chosen) return chosen;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK;
}

/** Loads a language before anything is shown. */
export async function loadLocale(locale: Locale = detectLocale()): Promise<void> {
  const module = await loaders[locale]();
  messages = module.default as Record<string, unknown>;
  current = locale;
  document.documentElement.lang = intlLocale();
}

/** For tests: use these texts directly. */
export function useMessages(locale: Locale, loaded: unknown): void {
  messages = loaded as Record<string, unknown>;
  current = locale;
}

export function currentLocale(): Locale {
  return current;
}

/** The tag for dates and numbers: "en", "es", "pt-BR". */
export function intlLocale(): string {
  return LOCALES.find((l) => l.id === current)?.intl ?? FALLBACK;
}

/** Remembers the language and reloads the window with it. Save everything before calling. */
export function changeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Without storage the language still follows the system.
  }
  location.reload();
}

function lookup(key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function isPlural(value: unknown): value is Plural {
  return typeof value === "object" && value !== null && "one" in value && "other" in value;
}

const plurals = new Map<string, Intl.PluralRules>();

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? value.toLocaleString(intlLocale()) : value;
  });
}

/** Whether a key exists in the current language (for keys built at run time). */
export function hasMessage(key: string): boolean {
  const value = lookup(key);
  return typeof value === "string" || isPlural(value);
}

/**
 * The text for a key, with its `{name}` placeholders filled in. A plural text
 * picks its form with `params.count`. A missing key shows itself, so it is easy
 * to spot.
 */
export function t(key: MessageKey, params?: Params): string {
  return translate(key, params);
}

/** Like `t`, for keys built at run time (from data or the HTML). */
export function translate(key: string, params?: Params): string {
  const value = lookup(key);
  if (typeof value === "string") return fill(value, params);
  if (isPlural(value)) {
    const count = Number(params?.count ?? 0);
    let rules = plurals.get(current);
    if (!rules) plurals.set(current, (rules = new Intl.PluralRules(intlLocale())));
    return fill(rules.select(count) === "one" ? value.one : value.other, params);
  }
  return key;
}

/** A message for an error from the core, in the current language when it has one. */
export function errorText(reason: unknown, fallback: MessageKey = "errors.generic"): string {
  if (isAppError(reason)) {
    if (reason.key && hasMessage(`errors.${reason.key}`)) return translate(`errors.${reason.key}`);
    return reason.message || t(fallback);
  }
  if (typeof reason === "string") return reason;
  return t(fallback);
}

/**
 * Fills the static interface written in index.html. Each element names its
 * keys: `data-i18n` (its text), `data-i18n-title`, `data-i18n-aria-label`,
 * `data-i18n-placeholder` and `data-i18n-hint` (the `data-hint` tooltip).
 */
export function translateDom(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = translate(el.dataset.i18n!);
  }
  const attributes: [string, string][] = [
    ["i18nTitle", "title"],
    ["i18nAriaLabel", "aria-label"],
    ["i18nPlaceholder", "placeholder"],
    ["i18nHint", "data-hint"],
  ];
  for (const [data, attribute] of attributes) {
    const selector = `[data-${data.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    for (const el of root.querySelectorAll<HTMLElement>(selector)) {
      el.setAttribute(attribute, translate(el.dataset[data]!));
    }
  }
}

/** Texts that the stylesheet shows by itself (`content:`), as CSS variables. */
export function translateCss(root: HTMLElement = document.documentElement): void {
  const labels: [string, MessageKey][] = [
    ["--label-previous-version", "common.previousVersion"],
    ["--label-next-step", "idea.next"],
    ["--label-write-here", "common.writeHere"],
  ];
  for (const [name, key] of labels) root.style.setProperty(name, JSON.stringify(t(key)));
}

/** A date and time in the current language. */
export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleString(intlLocale(), options);
}

/** A number in the current language (decimal comma or point). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(intlLocale(), options);
}

// The pen colors: up to 21 favorites pinned by the person, plus any other
// color, like in Paint. The palette colors (`ink`, `agua`…) adapt to the sky;
// the rest (`#rrggbb`) stay fixed.

import { EFFECTS, type Effect } from "./ink";
import { hasMessage, translate } from "../core/i18n";
import { INK_NAMES } from "../space/themes";

export const MAX_FAVORITES = 21;
const FAVORITES_KEY = "ourabox.colors";
const PENCIL_KEY = "ourabox.pencil";

/** A color with a name shown in the interface. The name is looked up when it
 *  is read, in the current language; `id` only picks the text. */
function named<T extends object>(id: string, group: string, rest: T): T & { readonly id: string; readonly name: string } {
  return Object.defineProperties({ ...rest } as T & { id: string; name: string }, {
    id: { value: id, enumerable: true },
    name: { get: () => translate(`colors.${group}.${id}`), enumerable: true },
  });
}

/** The colors you always have at hand (apart from the favorites). */
export const BASIC_COLORS: readonly { readonly hex: string; readonly id: string; readonly name: string }[] = [
  named("black", "basic", { hex: "#000000" }),
  named("white", "basic", { hex: "#ffffff" }),
  named("gray", "basic", { hex: "#8a8f98" }),
  named("red", "basic", { hex: "#e53935" }),
  named("orange", "basic", { hex: "#fb8c00" }),
  named("yellow", "basic", { hex: "#fdd835" }),
  named("green", "basic", { hex: "#43a047" }),
  named("turquoise", "basic", { hex: "#00acc1" }),
  named("blue", "basic", { hex: "#1e88e5" }),
  named("purple", "basic", { hex: "#8e24aa" }),
  named("pink", "basic", { hex: "#ec407a" }),
  named("brown", "basic", { hex: "#795548" }),
];

/** Preset palettes: groups of colors that go well together. */
export const PALETTES: readonly { readonly id: string; readonly name: string; readonly colors: string[] }[] = [
  named("pastel", "palettes", { colors: ["#f8c8dc", "#fde2b8", "#fff4b3", "#c9f2d0", "#bfe3f7", "#d9c9f5", "#f5d0c5"] }),
  named("earth", "palettes", { colors: ["#5b3a29", "#8b5e3c", "#b9855a", "#d9b48f", "#a3a86b", "#6b7b4b", "#c8553d"] }),
  named("ocean", "palettes", { colors: ["#03256c", "#2541b2", "#1768ac", "#06bee1", "#7fdeea", "#b8f2e6", "#f1faee"] }),
  named("forest", "palettes", { colors: ["#1b3a2b", "#2d6a4f", "#40916c", "#74c69d", "#b7e4c7", "#8a6d3b", "#d4a373"] }),
  named("sunset", "palettes", { colors: ["#2b1d4f", "#6a2c70", "#b83b5e", "#f08a5d", "#f9c74f", "#ffd6a5", "#ff8fab"] }),
  named("skin", "palettes", { colors: ["#3d2314", "#6b4226", "#8d5524", "#c68642", "#e0ac69", "#f1c27d", "#ffdbac"] }),
  named("vivid", "palettes", { colors: ["#ff0054", "#ff5400", "#ffbd00", "#00c49a", "#0096ff", "#7b2ff7", "#f72585"] }),
  named("grays", "palettes", { colors: ["#111111", "#333333", "#555555", "#777777", "#999999", "#bbbbbb", "#dddddd"] }),
];

/** A valid color for a stroke: a palette name or `#rrggbb`. */
export function isColor(value: unknown): value is string {
  return typeof value === "string" && ((INK_NAMES as readonly string[]).includes(value) || /^#[0-9a-f]{6}$/i.test(value));
}

/** The color to show on a button: the palette ones follow the sky. */
export function swatchCss(color: string): string {
  if (color === "ink") return "var(--text)";
  if ((INK_NAMES as readonly string[]).includes(color)) return `var(--ink-${color})`;
  return color;
}

/** The name of a color for the interface: a palette color by its name
 *  (the stored id, like `agua`, never changes), any other by its hex code. */
export function colorLabel(color: string): string {
  const key = `colors.ink.${color}`;
  return (INK_NAMES as readonly string[]).includes(color) && hasMessage(key) ? translate(key) : color.toUpperCase();
}

export function loadFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "null");
    if (Array.isArray(saved)) return dedupe(saved.filter(isColor)).slice(0, MAX_FAVORITES);
  } catch {
    // No saved favorites: the palette ones.
  }
  return [...INK_NAMES];
}

export function saveFavorites(colors: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(dedupe(colors).slice(0, MAX_FAVORITES)));
  } catch {
    // They are kept while the app is open.
  }
}

/** Adds a color to the favorites, if there is room and it is not there yet. */
export function addFavorite(colors: string[], color: string): string[] {
  if (!isColor(color) || colors.some((c) => c.toLowerCase() === color.toLowerCase()) || colors.length >= MAX_FAVORITES) return colors;
  return [...colors, color.toLowerCase()];
}

export function removeFavorite(colors: string[], color: string): string[] {
  return colors.filter((c) => c.toLowerCase() !== color.toLowerCase());
}

/** The last pen color and thickness (and the eraser size and strength), to
 *  pick up where you left off. */
export interface Pencil {
  color: string;
  size: number;
  /** From 0.05 (almost transparent) to 1 (solid). */
  opacity: number;
  eraserSize: number;
  /** From 0.05 (barely lightens) to 1 (erases completely). */
  eraserOpacity: number;
  /** Blend: the chosen kind, its size and its strength. */
  effect: Effect;
  effectSize: number;
  effectStrength: number;
  /** Shapes: outline thickness on the screen, transparency, fill color (null: none) and outline on or off. */
  shapeSize: number;
  shapeOpacity: number;
  shapeFill: string | null;
  shapeOutline: boolean;
}

export const EFFECT_SIZES = { min: 4, max: 120 };

export const ERASER_SIZES = { min: 4, max: 120 };

export function loadPencil(): Pencil {
  const between = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && value >= min && value <= max ? value : fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(PENCIL_KEY) ?? "null") as Partial<Record<keyof Pencil, unknown>> | null;
    return {
      color: isColor(saved?.color) ? saved.color : "ink",
      size: between(saved?.size, 1, 60, 6),
      opacity: between(saved?.opacity, 0.05, 1, 1),
      eraserSize: between(saved?.eraserSize, ERASER_SIZES.min, ERASER_SIZES.max, 24),
      eraserOpacity: between(saved?.eraserOpacity, 0.05, 1, 1),
      effect: EFFECTS.includes(saved?.effect as Effect) ? (saved?.effect as Effect) : "watercolor",
      effectSize: between(saved?.effectSize, EFFECT_SIZES.min, EFFECT_SIZES.max, 32),
      effectStrength: between(saved?.effectStrength, 0.05, 1, 0.6),
      shapeSize: between(saved?.shapeSize, 1, 40, 4),
      shapeOpacity: between(saved?.shapeOpacity, 0.05, 1, 1),
      shapeFill: isColor(saved?.shapeFill) ? saved.shapeFill : null,
      // Without a fill the outline is always there.
      shapeOutline: saved?.shapeOutline === false && isColor(saved?.shapeFill) ? false : true,
    };
  } catch {
    return { color: "ink", size: 6, opacity: 1, eraserSize: 24, eraserOpacity: 1, effect: "watercolor", effectSize: 32, effectStrength: 0.6, shapeSize: 4, shapeOpacity: 1, shapeFill: null, shapeOutline: true };
  }
}

export function savePencil(pencil: Pencil): void {
  try {
    localStorage.setItem(PENCIL_KEY, JSON.stringify(pencil));
  } catch {
    // Goes back to the usual values next time.
  }
}

/** Converts any CSS color to `#rrggbb`, for the color picker. */
export function toHex(css: string): string {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "#000000";
  context.fillStyle = "#000000";
  context.fillStyle = css;
  const value = context.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const match = value.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return "#000000";
  return `#${match
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function dedupe(colors: string[]): string[] {
  const seen = new Set<string>();
  return colors.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Mixing a color ----------
// OuraBox's own picker: hue, saturation and brightness (HSV), like in modern
// design tools. The system one, on Windows, is the old familiar one.

export interface Hsv {
  /** Hue, from 0 to 360. */
  h: number;
  /** Saturation, from 0 to 1. */
  s: number;
  /** Brightness, from 0 to 1. */
  v: number;
}

/** `#rrggbb` (or `rrggbb`, or `#rgb`) normalized, or null if it is not a color. */
export function parseHex(text: string): string | null {
  let t = text.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(t)) t = [...t].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null;
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

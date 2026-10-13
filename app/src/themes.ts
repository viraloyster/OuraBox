// OuraBox's skies: each color palette is a sky.
//
// The sky is drawn with CSS gradients, not images: it weighs nothing, doesn't
// depend on the internet and the browser paints it only once. The page always
// stays a calm color; the sky lives around it.
//
// Above the sky there is air: two soft lights that drift very slowly and,
// depending on the sky, rain that falls slowly or stars that twinkle. It moves
// without sound and without drawing attention (see `.sky-air` in styles.css).

import { t } from "./i18n";
import type themes from "./locales/en/themes";

/** The name of a sky in the messages (its id is stored and never changes). */
export type SkyKey = keyof typeof themes;

export interface Sky {
  /** Saved in localStorage: never rename. */
  id: string;
  key: SkyKey;
  dark: boolean;
  /** CSS background that draws the sky. */
  sky: string;
  page: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  /** The air that moves over the sky: two lights and, if any, rain or stars. */
  air: Air;
}

export interface Air {
  glow: string;
  glow2: string;
  particles: "none" | "rain" | "stars";
}

/** Colors for drawing. Strokes store the name, so they adapt to the sky. */
export const INK_NAMES = ["ink", "agua", "coral", "sol", "alga", "crepusculo"] as const;
export type InkName = (typeof INK_NAMES)[number];

export const INK_DAY: Record<Exclude<InkName, "ink">, string> = {
  agua: "#2B7C8A",
  coral: "#C2553C",
  sol: "#A5761C",
  alga: "#4C7C37",
  crepusculo: "#7260A6",
};

export const INK_NIGHT: Record<Exclude<InkName, "ink">, string> = {
  agua: "#72B6C2",
  coral: "#E8927B",
  sol: "#E0BA64",
  alga: "#90BC7D",
  crepusculo: "#ACA0DA",
};

/** Drawing colors from the first version, so old strokes adapt too. */
const LEGACY_INK: Record<string, InkName> = {
  "#3f8f9c": "agua",
  "#e07a5f": "coral",
  "#d9a441": "sol",
  "#6a994e": "alga",
  "#8e7dbe": "crepusculo",
};

/** The night stars; they twinkle on their own layer. */
export const STARS = [
  "radial-gradient(1.2px 1.2px at 12% 18%, #fff9 50%, transparent 51%)",
  "radial-gradient(1px 1px at 27% 42%, #fff8 50%, transparent 51%)",
  "radial-gradient(1.4px 1.4px at 46% 12%, #fffa 50%, transparent 51%)",
  "radial-gradient(1px 1px at 63% 30%, #fff7 50%, transparent 51%)",
  "radial-gradient(1.3px 1.3px at 78% 9%, #fff9 50%, transparent 51%)",
  "radial-gradient(1px 1px at 88% 38%, #fff7 50%, transparent 51%)",
  "radial-gradient(1.1px 1.1px at 8% 64%, #fff6 50%, transparent 51%)",
  "radial-gradient(1px 1px at 36% 74%, #fff5 50%, transparent 51%)",
  "radial-gradient(1.2px 1.2px at 71% 58%, #fff6 50%, transparent 51%)",
  "radial-gradient(1px 1px at 93% 79%, #fff5 50%, transparent 51%)",
].join(", ");


export const SKIES: Sky[] = [
  {
    id: "despejado",
    key: "clear",
    dark: false,
    sky: "radial-gradient(circle at 82% 8%, rgba(255,252,236,0.95) 0, rgba(255,246,214,0.45) 9%, transparent 30%), linear-gradient(180deg, #5DA4DC 0%, #8DC1EA 42%, #CFE5F6 100%)",
    page: "#FCFEFF",
    text: "#1E3040",
    muted: "#566B7B",
    faint: "#CFE0EC",
    accent: "#246FA3",
    accentSoft: "#DCEBF6",
    air: { glow: "rgba(255,250,225,0.55)", glow2: "rgba(255,255,255,0.35)", particles: "none" },
  },
  {
    id: "manana",
    key: "morning",
    dark: false,
    sky: "radial-gradient(ellipse at 30% 100%, rgba(255,214,170,0.9) 0, transparent 55%), linear-gradient(180deg, #A9C6E2 0%, #D6E0EC 45%, #F5DCCB 100%)",
    page: "#FFFDFB",
    text: "#262C3A",
    muted: "#5E6475",
    faint: "#E6DCD6",
    accent: "#4A6B98",
    accentSoft: "#E3E9F2",
    air: { glow: "rgba(255,220,180,0.5)", glow2: "rgba(205,222,245,0.45)", particles: "none" },
  },
  {
    id: "tarde-rosada",
    key: "pinkAfternoon",
    dark: false,
    sky: "radial-gradient(ellipse at 70% 95%, rgba(255,205,190,0.85) 0, transparent 55%), linear-gradient(180deg, #B9A9DA 0%, #DDB9D3 45%, #F6D3D2 100%)",
    page: "#FFFCFC",
    text: "#33283A",
    muted: "#6D5F72",
    faint: "#EBD9E2",
    accent: "#94487A",
    accentSoft: "#F3E2EC",
    air: { glow: "rgba(255,212,222,0.5)", glow2: "rgba(200,186,240,0.45)", particles: "none" },
  },
  {
    id: "atardecer",
    key: "sunset",
    dark: false,
    sky: "radial-gradient(ellipse at 50% 100%, rgba(255,196,110,0.95) 0, transparent 45%), linear-gradient(180deg, #2E2A5C 0%, #7A3B6E 38%, #D9604A 72%, #F3A65A 100%)",
    page: "#FFFAF6",
    text: "#35262A",
    muted: "#735F5E",
    faint: "#EED9CF",
    accent: "#A9472C",
    accentSoft: "#F6E1D8",
    air: { glow: "rgba(255,190,120,0.42)", glow2: "rgba(150,75,135,0.38)", particles: "none" },
  },
  {
    id: "gris",
    key: "grayDay",
    dark: false,
    sky: "radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.55) 0, transparent 50%), radial-gradient(ellipse at 85% 30%, rgba(255,255,255,0.4) 0, transparent 45%), linear-gradient(180deg, #AEB6BD 0%, #C9CFD4 50%, #DDE1E4 100%)",
    page: "#FBFCFC",
    text: "#262D33",
    muted: "#5C666E",
    faint: "#D9DEE2",
    accent: "#4A5F6C",
    accentSoft: "#E3E8EB",
    air: { glow: "rgba(255,255,255,0.42)", glow2: "rgba(236,240,244,0.4)", particles: "none" },
  },
  {
    id: "lluvia",
    key: "rainy",
    dark: false,
    sky: `radial-gradient(ellipse at 50% 0%, rgba(210,220,228,0.6) 0, transparent 60%), linear-gradient(180deg, #5F7182 0%, #8396A6 50%, #AAB8C3 100%)`,
    page: "#F9FBFC",
    text: "#1F2C36",
    muted: "#55646F",
    faint: "#D3DCE2",
    accent: "#2F6681",
    accentSoft: "#DDE8EE",
    air: { glow: "rgba(222,232,240,0.42)", glow2: "rgba(140,162,184,0.38)", particles: "rain" },
  },
  {
    id: "tormenta",
    key: "storm",
    dark: true,
    sky: "radial-gradient(ellipse at 72% 22%, rgba(214,206,255,0.35) 0, transparent 28%), radial-gradient(ellipse at 20% 0%, rgba(120,110,160,0.5) 0, transparent 55%), linear-gradient(180deg, #171A28 0%, #2E3249 55%, #4A4E66 100%)",
    page: "#1B1F2C",
    text: "#DDE0EB",
    muted: "#9499AE",
    faint: "#30364A",
    accent: "#ABB4EE",
    accentSoft: "#2A3047",
    air: { glow: "rgba(190,180,255,0.2)", glow2: "rgba(90,96,145,0.4)", particles: "none" },
  },
  {
    id: "hora-azul",
    key: "blueHour",
    dark: true,
    sky: "radial-gradient(ellipse at 50% 100%, rgba(150,170,230,0.55) 0, transparent 50%), linear-gradient(180deg, #121B36 0%, #26355F 50%, #50659C 100%)",
    page: "#162038",
    text: "#DCE3F2",
    muted: "#93A0BE",
    faint: "#2A3657",
    accent: "#9FB6F0",
    accentSoft: "#243051",
    air: { glow: "rgba(150,176,240,0.28)", glow2: "rgba(90,112,182,0.34)", particles: "none" },
  },
  {
    id: "noche",
    key: "starryNight",
    dark: true,
    sky: `radial-gradient(ellipse at 50% 120%, rgba(60,110,140,0.45) 0, transparent 60%), linear-gradient(180deg, #060B15 0%, #0C1A2C 60%, #12263A 100%)`,
    page: "#111C26",
    text: "#D8E3E7",
    muted: "#8D9FA7",
    faint: "#24343F",
    accent: "#7EB6C3",
    accentSoft: "#1B2E38",
    air: { glow: "rgba(80,140,170,0.2)", glow2: "rgba(40,72,112,0.3)", particles: "stars" },
  },
];

export const AUTO = "auto";
const STORAGE_KEY = "ourabox.sky";

/** The name shown for a sky, in the current language. */
export function skyName(sky: Sky): string {
  return t(`themes.${sky.key}.name`);
}

/** A few words on what a sky is good for, in the current language. */
export function skyMood(sky: Sky): string {
  return t(`themes.${sky.key}.mood`);
}

export function findSky(id: string): Sky | undefined {
  return SKIES.find((sky) => sky.id === id);
}

/** The chosen sky, or "auto" to follow the system's light or dark mode. */
export function savedChoice(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === AUTO || (value && findSky(value))) return value;
  } catch {
    // No storage available: automatic is used.
  }
  return AUTO;
}

export function saveChoice(choice: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not serious: next time it opens in automatic.
  }
}

export function resolveSky(choice: string, prefersDark: boolean): Sky {
  return findSky(choice) ?? findSky(prefersDark ? "noche" : "despejado")!;
}

export function applySky(sky: Sky, root: HTMLElement = document.documentElement): void {
  const inks = sky.dark ? INK_NIGHT : INK_DAY;
  const vars: Record<string, string> = {
    "--sky": sky.sky,
    "--page": sky.page,
    "--text": sky.text,
    "--muted": sky.muted,
    "--faint": sky.faint,
    "--accent": sky.accent,
    "--accent-soft": sky.accentSoft,
    "--air-glow": sky.air.glow,
    "--air-glow-2": sky.air.glow2,
    "--stars": STARS,
  };
  for (const [name, color] of Object.entries(inks)) vars[`--ink-${name}`] = color;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.sky = sky.id;
  root.dataset.air = sky.air.particles;
  root.dataset.tone = sky.dark ? "dark" : "light";
  root.style.colorScheme = sky.dark ? "dark" : "light";
}

/** Turns the color saved in a stroke into the real color for the current sky. */
export function inkColor(color: string, sky: Sky): string {
  const name: string = LEGACY_INK[color.toLowerCase()] ?? color;
  if (name === "ink") return sky.text;
  const inks: Record<string, string> = sky.dark ? INK_NIGHT : INK_DAY;
  return inks[name] ?? color;
}

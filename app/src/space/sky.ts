// The chosen sky and its picker.

import { t } from "../core/i18n";
import { setupReading } from "../page/reading";
import { AUTO, SKIES, STARS, applySky, resolveSky, saveChoice, savedChoice, skyMood, skyName, type Sky } from "./themes";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let choice = savedChoice();
let sky: Sky = resolveSky(choice, darkQuery.matches);
let layer = 0;
let changed: () => void = () => {};

export function currentSky(): Sky {
  return sky;
}

/** Applies the saved sky. `onChange` is called every time the sky changes. */
export function setupSky(onChange: () => void): void {
  changed = onChange;
  setSky(sky, false);
  setupReading();
  // In automatic, the sky follows the system's light or dark mode.
  darkQuery.addEventListener("change", () => {
    if (choice === AUTO) setSky(resolveSky(AUTO, darkQuery.matches));
  });
}

function setSky(next: Sky, animate = true): void {
  sky = next;
  applySky(sky);
  document.documentElement.style.setProperty("--glass", withAlpha(sky.page, sky.dark ? 0.72 : 0.76));
  document.documentElement.style.setProperty("--glass-still", withAlpha(sky.page, sky.dark ? 0.8 : 0.84));
  // The new sky appears over the previous one with a slow fade.
  const layers = [$("sky-a"), $("sky-b")];
  const incoming = animate ? 1 - layer : layer;
  layers[incoming].style.background = sky.sky;
  if (animate) {
    layers[layer].classList.remove("visible");
    layers[incoming].classList.add("visible");
    layer = incoming;
  }
  changed();
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function choose(next: string): void {
  choice = next;
  saveChoice(next);
  setSky(resolveSky(next, darkQuery.matches));
  renderPicker();
}

/** The skies to choose from (in settings). */
export function renderPicker(): void {
  const cards = [
    card(AUTO, t("sky.auto"), t("sky.autoMood"), null),
    ...SKIES.map((s) => card(s.id, skyName(s), skyMood(s), s)),
  ];
  cards.forEach((c, i) => (c.style.animationDelay = `${i * 30}ms`));
  $("sky-grid").replaceChildren(...cards);
}

function card(id: string, name: string, mood: string, preview: Sky | null): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "sky-card";
  button.setAttribute("role", "radio");
  button.setAttribute("aria-checked", String(choice === id));
  if (preview) {
    button.style.background = preview.air.particles === "stars" ? `${STARS}, ${preview.sky}` : preview.sky;
    // A miniature page shows how that sky's palette looks.
    const sheet = document.createElement("span");
    sheet.className = "sheet";
    sheet.style.background = preview.page;
    for (const [color, width] of [[preview.text, "70%"], [preview.muted, "90%"], [preview.accent, "35%"]] as const) {
      const line = document.createElement("i");
      line.style.background = color;
      line.style.width = width;
      sheet.appendChild(line);
    }
    button.appendChild(sheet);
  } else {
    button.classList.add("auto");
  }
  const label = document.createElement("span");
  label.className = "label";
  const title = document.createElement("strong");
  title.textContent = name;
  const subtitle = document.createElement("small");
  subtitle.textContent = mood;
  label.append(title, subtitle);
  button.appendChild(label);
  button.addEventListener("click", () => choose(id));
  return button;
}

// The color panel: favorites, basic colors, the mixer, the palettes and the
// eyedropper. The colors themselves (names, favorites storage) are in colors.ts.

import { t } from "./i18n";
import { currentSky } from "./sky";
import { inkColor } from "./themes";
import {
  addFavorite,
  BASIC_COLORS,
  colorLabel,
  hexToHsv,
  type Hsv,
  hsvToHex,
  MAX_FAVORITES,
  PALETTES,
  parseHex,
  removeFavorite,
  saveFavorites,
  swatchCss,
  toHex,
} from "./colors";
import { closePanels } from "./hints";
import { applyInkSettings, readFlag, renderSize, savePencilSettings, selectTool, writeFlag } from "./drawtools";
import { $, app, inkSettings, setStatus, ws } from "./state";

// ---------- Mixing a color ----------

/** The color the mixer shows. Kept apart from the hex so the hue is not lost
 *  when the color is gray, white or black. */
let mix: Hsv = { h: 200, s: 0.6, v: 0.6 };

// ---------- Palettes ----------

const PALETTES_PINNED_KEY = "ourabox.palettes.pinned";
let palettesOpen = false;

/** The palettes open from the color panel. Pinned, they stay in view while
 *  drawing (also when the app is opened again); otherwise they hide when
 *  touching outside. They only show in draw mode. */
export function setupPalettes(): void {
  const drawer = $("palette-drawer");
  $("palettes").replaceChildren(
    ...PALETTES.flatMap(({ name, colors }) => {
      const label = Object.assign(document.createElement("p"), { className: "palette-name", textContent: name });
      const row = document.createElement("div");
      row.className = "palette-row";
      row.setAttribute("role", "radiogroup");
      row.setAttribute("aria-label", name);
      for (const color of colors) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "swatch";
        button.dataset.color = color;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-label", `${name}: ${color}`);
        button.title = t("main.colors.paletteSwatch", { color });
        button.style.setProperty("--swatch", color);
        button.addEventListener("click", () => setColor(color));
        // Right-click: adds it to the favorites.
        button.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          ws.favorites = addFavorite(ws.favorites, color);
          saveFavorites(ws.favorites);
          renderColors();
        });
        row.appendChild(button);
      }
      return [label, row];
    }),
  );
  palettesOpen = readFlag(PALETTES_PINNED_KEY);
  $("pin-palettes").setAttribute("aria-pressed", String(palettesOpen));
  $("open-palettes").addEventListener("click", () => {
    palettesOpen = !palettesOpen || drawer.hidden;
    closePanels();
    renderPalettes();
  });
  $("close-palettes").addEventListener("click", () => {
    palettesOpen = false;
    renderPalettes();
  });
  $("pin-palettes").addEventListener("click", () => {
    const pinned = !readFlag(PALETTES_PINNED_KEY);
    writeFlag(PALETTES_PINNED_KEY, pinned);
    $("pin-palettes").setAttribute("aria-pressed", String(pinned));
  });
  // Unpinned, they hide when touching outside (the page included).
  document.addEventListener("pointerdown", (e) => {
    if (drawer.hidden || readFlag(PALETTES_PINNED_KEY)) return;
    const target = e.target as Node;
    if (drawer.contains(target) || $("open-palettes").contains(target)) return;
    palettesOpen = false;
    renderPalettes();
  });
  renderPalettes();
}

export function renderPalettes(): void {
  const drawer = $("palette-drawer");
  const drawing = app.classList.contains("drawing");
  // Unpinned, leaving draw mode hides them completely.
  if (!drawing && !readFlag(PALETTES_PINNED_KEY)) palettesOpen = false;
  drawer.hidden = !palettesOpen || !drawing;
  $("open-palettes").setAttribute("aria-expanded", String(!drawer.hidden));
  $("open-palettes").textContent = drawer.hidden ? t("main.colors.showPalettes") : t("main.colors.hidePalettes");
}

export function setupColorMixer(): void {
  const field = $("color-field");
  const hue = $<HTMLInputElement>("hue-range");
  const hex = $<HTMLInputElement>("custom-color");
  const pickAt = (e: PointerEvent) => {
    const rect = field.getBoundingClientRect();
    mix = {
      h: mix.h,
      s: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      v: Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height)),
    };
    setColor(hsvToHex(mix));
  };
  field.addEventListener("pointerdown", (e) => {
    field.setPointerCapture(e.pointerId);
    pickAt(e);
  });
  field.addEventListener("pointermove", (e) => {
    if (field.hasPointerCapture(e.pointerId)) pickAt(e);
  });
  // It also moves with the arrow keys, for those who don't use the mouse.
  field.addEventListener("keydown", (e) => {
    const step = 0.04;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    mix = { h: mix.h, s: Math.min(1, Math.max(0, mix.s + move[0])), v: Math.min(1, Math.max(0, mix.v + move[1])) };
    setColor(hsvToHex(mix));
  });
  hue.addEventListener("input", () => {
    mix = { ...mix, h: Number(hue.value) };
    // Picking a hue while the color is gray makes it vivid, so it shows.
    if (mix.s < 0.05) mix.s = 0.7;
    if (mix.v < 0.05) mix.v = 0.7;
    setColor(hsvToHex(mix));
  });
  hex.addEventListener("input", () => {
    const parsed = parseHex(hex.value);
    if (parsed) setColor(parsed);
  });
  hex.addEventListener("blur", () => renderColors());
}

/** Shows a color in the mixer, without losing the chosen hue if it is a gray. */
function syncMixer(hex: string): void {
  if (hsvToHex(mix) !== hex) {
    const next = hexToHsv(hex);
    mix = next.s === 0 || next.v === 0 ? { ...next, h: mix.h } : next;
  }
  const field = $("color-field");
  field.style.setProperty("--hue", String(Math.round(mix.h)));
  field.style.setProperty("--sat", String(mix.s));
  field.style.setProperty("--val", String(mix.v));
  field.style.setProperty("--picked", hex);
  field.setAttribute("aria-valuetext", hex);
  const hue = $<HTMLInputElement>("hue-range");
  hue.value = String(Math.round(mix.h));
  hue.style.setProperty("--hue", String(Math.round(mix.h)));
  $("color-panel").style.setProperty("--picked", hex);
  const input = $<HTMLInputElement>("custom-color");
  if (document.activeElement !== input) input.value = hex;
}

function setColor(color: string): void {
  applyInkSettings({ color });
  // A selected shape takes the color for its outline.
  ws.active?.ink.updateSelected({ color });
  // Picking a color is for painting: with the eraser, blur or smudge in use,
  // it goes back to the pen; watercolor stays (it paints with that color).
  if (inkSettings.tool === "eraser" || (inkSettings.effect && inkSettings.effect !== "watercolor")) selectTool("pen");
  savePencilSettings();
  renderColors();
  renderSize();
}

/** The eyedropper: takes a color from the screen. Where the system offers it,
 *  from anywhere on the screen; if not, from the page (the drawing, or the paper). */
export async function pickColor(): Promise<void> {
  const Dropper = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  if (Dropper) {
    try {
      const { sRGBHex } = await new Dropper().open();
      const hex = sRGBHex.startsWith("#") ? sRGBHex.toLowerCase() : rgbToHex(sRGBHex);
      if (hex) setColor(hex);
    } catch {
      // Cancelled with Escape.
    }
    return;
  }
  closePanels();
  setStatus(t("html.color.pickHint"));
  app.classList.add("picking");
  const take = (e: PointerEvent) => {
    const pane = ws.panes.find((p) => p.root.contains(e.target as Node));
    const page = (e.target as HTMLElement).closest?.(".page");
    app.classList.remove("picking");
    document.removeEventListener("pointerdown", take, true);
    if (!pane || !page) return;
    e.preventDefault();
    e.stopPropagation();
    const color = pane.ink.colorAt(e.clientX, e.clientY) ?? rgbToHex(getComputedStyle(page).backgroundColor);
    if (color) setColor(color);
  };
  document.addEventListener("pointerdown", take, true);
}

/** "rgb(12, 34, 56)" as "#0c2238". */
function rgbToHex(rgb: string): string | null {
  const parts = rgb.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  return `#${parts.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
}

export function renderColors(): void {
  const current = inkSettings.color;
  $("color-button").style.setProperty("--swatch", swatchCss(current));
  $("color-button").setAttribute("aria-label", t("main.colors.button", { name: colorLabel(current) }));
  const buttons = ws.favorites.map((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(color.toLowerCase() === current.toLowerCase()));
    button.setAttribute("aria-label", colorLabel(color));
    button.style.setProperty("--swatch", swatchCss(color));
    button.addEventListener("click", () => setColor(color));
    // Right-click (or the cross) removes the color from the favorites.
    const remove = () => {
      ws.favorites = removeFavorite(ws.favorites, color);
      saveFavorites(ws.favorites);
      renderColors();
    };
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      remove();
    });
    const cross = document.createElement("span");
    cross.className = "swatch-remove";
    cross.setAttribute("aria-hidden", "true");
    cross.addEventListener("click", (e) => {
      e.stopPropagation();
      remove();
    });
    button.appendChild(cross);
    return button;
  });
  $("favorites").replaceChildren(...buttons);
  const checked = (color: string) => String(color.toLowerCase() === current.toLowerCase());
  $("basic-colors").replaceChildren(
    ...BASIC_COLORS.map(({ hex, name }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", checked(hex));
      button.setAttribute("aria-label", name);
      button.title = name;
      button.style.setProperty("--swatch", hex);
      button.addEventListener("click", () => setColor(hex));
      return button;
    }),
  );
  for (const swatch of document.querySelectorAll<HTMLElement>("#palettes .swatch")) {
    swatch.setAttribute("aria-checked", checked(swatch.dataset.color ?? ""));
  }
  syncMixer(toHex(current.startsWith("#") ? current : inkColor(current, currentSky())));
  const pinned = ws.favorites.some((c) => c.toLowerCase() === current.toLowerCase());
  const pin = $<HTMLButtonElement>("pin-color");
  pin.disabled = pinned || ws.favorites.length >= MAX_FAVORITES;
  pin.textContent = pinned ? t("main.colors.pinned") : t("main.colors.pin");
  $("favorites-note").textContent =
    ws.favorites.length >= MAX_FAVORITES
      ? t("main.colors.favoritesFull", { max: MAX_FAVORITES })
      : t("main.colors.favoritesCount", { count: ws.favorites.length, max: MAX_FAVORITES });
}

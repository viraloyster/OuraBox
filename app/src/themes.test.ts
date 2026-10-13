import { describe, expect, it } from "vitest";
import { INK_DAY, INK_NIGHT, SKIES, inkColor, resolveSky, skyMood, skyName } from "./themes";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// A sky can be pretty, but the page always has to read calmly.
describe.each(SKIES.map((sky) => [skyName(sky), sky] as const))("%s", (_, sky) => {
  it("text is very readable on the page", () => {
    expect(contrast(sky.text, sky.page)).toBeGreaterThanOrEqual(7);
  });

  it("secondary text and accent are readable on the page", () => {
    expect(contrast(sky.muted, sky.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(sky.accent, sky.page)).toBeGreaterThanOrEqual(4.5);
  });

  it("every drawing color is visible on the page", () => {
    for (const color of Object.values(sky.dark ? INK_NIGHT : INK_DAY)) {
      expect(contrast(color, sky.page)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses no pure white or pure black on the page", () => {
    for (const color of [sky.page, sky.text]) {
      expect(["#FFFFFF", "#000000"]).not.toContain(color.toUpperCase());
    }
  });
});

describe("inkColor", () => {
  const day = resolveSky("despejado", false);
  const night = resolveSky("noche", true);

  it("adapts named colors to the sky", () => {
    expect(inkColor("coral", day)).toBe(INK_DAY.coral);
    expect(inkColor("coral", night)).toBe(INK_NIGHT.coral);
    expect(inkColor("ink", night)).toBe(night.text);
  });

  it("adapts colors saved by the first version", () => {
    expect(inkColor("#e07a5f", night)).toBe(INK_NIGHT.coral);
  });

  it("keeps any other color as it is", () => {
    expect(inkColor("#123456", day)).toBe("#123456");
  });

  it("paints black with the sky's ink on a dark sky, and only there", () => {
    for (const black of ["#000000", "#000", "#1a1a1a", "#202124"]) {
      expect(inkColor(black, night)).toBe(night.text);
      expect(inkColor(black, day)).toBe(black);
    }
    // Dark colors with a hue are a choice, and gray is visible enough.
    expect(inkColor("#03256c", night)).toBe("#03256c");
    expect(inkColor("#8a8f98", night)).toBe("#8a8f98");
  });

  it("keeps black on paper, where exports are drawn", () => {
    expect(inkColor("#000000", resolveSky("despejado", false))).toBe("#000000");
  });
});

describe("sky names", () => {
  it("shows each sky with its English name and mood", () => {
    const clear = resolveSky("despejado", false);
    expect(skyName(clear)).toBe("Clear");
    expect(skyMood(clear)).toBe("Clarity to focus");
    expect(skyName(resolveSky("noche", true))).toBe("Starry night");
  });
});

describe("resolveSky", () => {
  it("follows the system when set to automatic", () => {
    expect(resolveSky("auto", false).id).toBe("despejado");
    expect(resolveSky("auto", true).id).toBe("noche");
    expect(resolveSky("tormenta", false).id).toBe("tormenta");
  });
});

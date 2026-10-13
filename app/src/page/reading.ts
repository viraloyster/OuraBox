// Comfort for reading and writing for hours: the font size of the page and
// its typeface (sans serif, more modern; serif, more like a book).

const KEY = "ourabox.reading";

/** The base size of the page text. Each part of the text can have its own size, from the top bar. */
const READING_SIZE = 17;
export type ReadingFont = "sans" | "serif";

export interface Reading {
  size: number;
  font: ReadingFont;
}

const FONTS: Record<ReadingFont, string> = {
  sans: "var(--font)",
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
};

export function loadReading(): Reading {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Reading> | null;
    // The book typeface by default; modern only if it was chosen.
    const font: ReadingFont = saved?.font === "sans" ? "sans" : "serif";
    return { size: READING_SIZE, font };
  } catch {
    return { size: READING_SIZE, font: "serif" };
  }
}

export function saveReading(reading: Reading): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(reading));
  } catch {
    // It goes back to the usual next time.
  }
}

export function applyReading(reading: Reading, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--reading-size", `${reading.size}px`);
  root.style.setProperty("--reading-font", FONTS[reading.font]);
}

/** The typeface of the pages: book style (the default) or modern, from the letter panel in the top bar. */
export function setupReading(): void {
  let reading = loadReading();
  applyReading(reading);
  const render = () => {
    for (const button of document.querySelectorAll<HTMLElement>("[data-reading-font]")) {
      button.setAttribute("aria-checked", String(button.dataset.readingFont === reading.font));
    }
  };
  const update = (change: Partial<Reading>) => {
    reading = { ...reading, ...change };
    applyReading(reading);
    saveReading(reading);
    render();
  };
  for (const button of document.querySelectorAll<HTMLElement>("[data-reading-font]")) {
    button.addEventListener("click", () => update({ font: button.dataset.readingFont as ReadingFont }));
  }
  render();
}

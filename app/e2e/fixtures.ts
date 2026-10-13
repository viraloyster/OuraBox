// What every end-to-end test shares: a page that fails the test on any
// uncaught error or console error, and the steps to get into the app.
//
// The browser preview of the core keeps everything in the tab's memory, so a
// reload starts over with no users. That is why the tests come back to a
// document by locking or signing out and in again, never by reloading.

import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`Uncaught: ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
    });
    await use(page);
    // Checked after the test: a flow that "works" while throwing is still broken.
    expect(problems, "the page logged errors").toEqual([]);
  },
});

export const PASSWORD = "a calm long sentence";

/** Creates a user from an empty door, with its first project, and waits for
 *  the new document to be ready to type in. Without `navigate`, it starts
 *  from the door already in view. */
export async function signUp(page: Page, user = "Ada", project = "First project", { navigate = true } = {}): Promise<void> {
  if (navigate) await page.goto("/");
  const card = page.locator("#lock-card");
  await card.locator("input[autocomplete=username]").fill(user);
  const passwords = card.locator("input[type=password]");
  await expect(passwords).toHaveCount(2);
  await passwords.nth(0).fill(PASSWORD);
  await passwords.nth(1).fill(PASSWORD);
  await card.locator("button[type=submit]").click();

  // The recovery key, shown once: the button waits for the confirmation.
  await expect(card.locator(".recovery-code")).toBeVisible();
  const enter = card.locator("button[type=submit]");
  await expect(enter).toBeDisabled();
  await card.locator(".check input[type=checkbox]").check();
  await enter.click();

  // With no projects, the first thing is to start one.
  await expect(page.locator("#lock-screen")).toBeHidden();
  await page.locator("#welcome-name").fill(project);
  await page.locator("#welcome-start").click();
  await expect(page.locator("#welcome")).toBeHidden();
  await expect(editor(page)).toBeVisible();
}

/** The active document's text. */
export function editor(page: Page): Locator {
  return page.locator("#panes .pane .editor").first();
}

/** Types at the end of the document, in write mode. */
export async function typeAtEnd(page: Page, text: string): Promise<void> {
  const target = editor(page);
  await target.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

/** Waits until the last change is saved. The status keeps its text after it fades. */
export async function expectSaved(page: Page): Promise<void> {
  await expect(page.locator("#status")).toHaveText("Saved");
}

/** How many pixels of a drawing layer have something on them. "behind" is
 *  the ink under the text; "live" the stroke in progress and the handles of
 *  the selected shape. */
export async function inkedPixels(page: Page, layer: "behind" | "live" = "behind"): Promise<number> {
  return page.locator(`#panes .pane canvas.ink.${layer}`).first().evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  });
}

/** A point on the page, as a fraction of the visible part of it. */
async function pagePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator("#panes .pane .page").first().boundingBox();
  if (!box) throw new Error("The page is not visible");
  const visibleHeight = Math.min(box.height, (page.viewportSize()?.height ?? 900) - box.y);
  return { x: box.x + box.width * x, y: box.y + visibleHeight * y };
}

/** Drags the mouse across the page, from and to points given as fractions of it. */
export async function drag(page: Page, from: [number, number], to: [number, number], steps = 20): Promise<void> {
  const start = await pagePoint(page, ...from);
  const end = await pagePoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/** Waits until the panes stop changing size (the side list slides for a moment). */
export async function layoutSettled(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const width = (await page.locator("#panes").boundingBox())?.width ?? 0;
        const steady = width === last;
        last = width;
        return steady;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

/** A first click on the page, as a person does before anything else: the side
 *  list slides away (it hides on the first touch of the page) and the layout
 *  settles before anything is drawn. */
export async function touchPage(page: Page): Promise<void> {
  await editor(page).click();
  await expect(page.locator("#app")).toHaveClass(/sidebar-hidden/);
  await layoutSettled(page);
}

/** Lets the canvases finish the repaints already asked for (they happen on the next frame). */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Switches to drawing and waits for the toolbar to follow and for the
 *  repaint the switch asks for. */
export async function startDrawing(page: Page): Promise<void> {
  await page.locator("#mode-draw").click();
  await expect(page.locator("#mode-draw")).toHaveAttribute("aria-pressed", "true");
  await settle(page);
}

export async function startWriting(page: Page): Promise<void> {
  await page.locator("#mode-write").click();
  await expect(page.locator("#mode-write")).toHaveAttribute("aria-pressed", "true");
}

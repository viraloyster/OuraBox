import { drag, editor, expect, inkedPixels, layoutSettled, settle, signUp, startDrawing, startWriting, test, touchPage, typeAtEnd } from "./fixtures";

// Canvases are painted on the next frame: assertions on pixels poll until they hold.

test("a stroke drawn with the mouse inks the page; Ctrl+Z removes it and Ctrl+Y brings it back", async ({ page }) => {
  await signUp(page);
  await touchPage(page);
  await startDrawing(page);
  expect(await inkedPixels(page)).toBe(0);

  await drag(page, [0.3, 0.4], [0.7, 0.6]);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100);
  const drawn = await inkedPixels(page);

  await page.keyboard.press("Control+z");
  await expect.poll(() => inkedPixels(page)).toBe(0);

  await page.keyboard.press("Control+y");
  await expect.poll(() => inkedPixels(page)).toBe(drawn);
});

// The first touch of the page hides the side list, so the page widens while
// the first stroke is still being drawn, and the canvases repaint in the middle
// of it. That repaint must still count the stroke in progress as painted on its
// layer, or undoing it would leave it on screen.
test("a first stroke drawn while the side list slides away is undone from the screen too", async ({ page }) => {
  await signUp(page);
  await startDrawing(page);
  await expect(page.locator("#app")).not.toHaveClass(/sidebar-hidden/);

  const box = (await page.locator("#panes .pane .page").first().boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + 220, { steps: 5 });
  // The side list hides on that first touch: the stroke goes on while the page widens.
  await expect(page.locator("#app")).toHaveClass(/sidebar-hidden/);
  await layoutSettled(page);
  await page.mouse.move(box.x + box.width * 0.6, box.y + 300, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100);

  await page.keyboard.press("Control+z");
  await expect.poll(() => inkedPixels(page), { timeout: 2000 }).toBe(0);
});

test("one undo for text and drawing: Ctrl+Z goes back across modes, in reverse order", async ({ page }) => {
  await signUp(page);
  await typeAtEnd(page, "First words.");

  await startDrawing(page);
  await drag(page, [0.3, 0.5], [0.7, 0.7]);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100);

  await startWriting(page);
  await typeAtEnd(page, " More words.");
  await expect(editor(page)).toHaveText("First words. More words.");

  // The focus is in the text: Ctrl+Z is the document's, not the browser's.
  await page.keyboard.press("Control+z");
  await expect(editor(page)).toHaveText("First words.");
  await settle(page);
  expect(await inkedPixels(page)).toBeGreaterThan(100);

  await page.keyboard.press("Control+z");
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await expect(editor(page)).toHaveText("First words.");

  await page.keyboard.press("Control+z");
  await expect(editor(page)).toHaveText("");
});

test("a long stroke completes without errors and leaves ink", async ({ page }) => {
  await signUp(page);
  await startDrawing(page);
  const box = (await page.locator("#panes .pane .page").first().boundingBox())!;
  const left = box.x + box.width * 0.15;
  const width = box.width * 0.6;
  const top = box.y + 150;

  await page.mouse.move(left, top);
  await page.mouse.down();
  // About 800 moves: a slow, winding line across the page. The side list
  // slides away during it, so the canvases also repaint mid-stroke.
  for (let i = 1; i <= 800; i++) {
    const x = left + (width * (i % 200)) / 200;
    const y = top + 40 * Math.floor(i / 200) + 15 * Math.sin(i / 8);
    await page.mouse.move(x, y);
  }
  await page.mouse.up();

  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(2000);
  await expect(page.locator("#status")).toHaveText("Saved");
});

test("a rectangle stays selected after drawing it; Delete removes it and undo brings it back", async ({ page }) => {
  await signUp(page);
  await touchPage(page);
  await startDrawing(page);
  await page.locator("#shape-button").click();
  await expect(page.locator("#shape-panel")).toBeVisible();
  await page.locator('#shape-panel [data-shape="rect"]').click();
  await expect(page.locator('#shape-panel [data-shape="rect"]')).toHaveAttribute("aria-checked", "true");
  // Back to the page with the panel closed.
  await page.keyboard.press("Escape");
  await expect(page.locator("#shape-panel")).toBeHidden();

  await drag(page, [0.3, 0.3], [0.6, 0.6]);
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(100);
  const drawn = await inkedPixels(page);
  // The selection's handles are drawn on the live layer.
  await expect.poll(() => inkedPixels(page, "live")).toBeGreaterThan(0);

  await page.keyboard.press("Delete");
  await expect.poll(() => inkedPixels(page)).toBe(0);
  await expect.poll(() => inkedPixels(page, "live")).toBe(0);

  await page.keyboard.press("Control+z");
  await expect.poll(() => inkedPixels(page)).toBe(drawn);
});

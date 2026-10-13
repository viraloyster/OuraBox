import { editor, expect, expectSaved, PASSWORD, signUp, test, typeAtEnd } from "./fixtures";

// The browser preview forgets everything on reload, so "coming back later" is
// signing out and in again: the document must come back from storage, since
// signing out clears it from the screen.
test("what is written is saved, and is still there after signing out and in again", async ({ page }) => {
  await signUp(page, "Ada", "Notebook");
  await typeAtEnd(page, "A sentence that should outlive the session.");
  await expectSaved(page);

  await page.locator("#open-settings").click();
  await page.locator("#sign-out").click();
  await expect(page.locator("#lock-screen")).toBeVisible();
  await expect(editor(page)).toHaveText("");

  // Signed out, the door asks for the name too.
  const card = page.locator("#lock-card");
  await expect(card.locator("h1")).toHaveText("Welcome back");
  await card.locator("input[autocomplete=username]").fill("ada");
  await card.locator("input[type=password]").fill(PASSWORD);
  await card.locator("button[type=submit]").click();

  await expect(page.locator("#lock-screen")).toBeHidden();
  await expect(editor(page)).toHaveText("A sentence that should outlive the session.");
  await expect(page.locator("#doc-list")).toContainText("Notebook");
});

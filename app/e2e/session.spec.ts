import { editor, expect, expectSaved, PASSWORD, signUp, test, typeAtEnd } from "./fixtures";

test("Ctrl+L locks: the door asks only for the password, refuses a wrong one and opens with the right one", async ({ page }) => {
  await signUp(page, "Grace");
  await typeAtEnd(page, "Behind the lock.");
  await expectSaved(page);

  await page.keyboard.press("Control+l");
  const card = page.locator("#lock-card");
  await expect(page.locator("#lock-screen")).toBeVisible();
  await expect(card.locator("h1")).toHaveText("Locked");
  await expect(card.locator(".lock-text")).toContainText("Grace");
  // The name is known: the only field shown is the password.
  await expect(card.locator("input:visible")).toHaveCount(1);
  const password = card.locator("input[type=password]:visible");
  await expect(password).toBeFocused();
  // Nothing decrypted stays on screen behind the door.
  await expect(editor(page)).toHaveText("");

  await password.fill("not the password");
  await card.locator("button[type=submit]").click();
  await expect(card.locator(".lock-error")).toHaveText("That password doesn't open this space. Try again, calmly.");
  await expect(password).toHaveValue("");
  await expect(page.locator("#lock-screen")).toBeVisible();

  await password.fill(PASSWORD);
  await card.locator("button[type=submit]").click();
  await expect(page.locator("#lock-screen")).toBeHidden();
  await expect(editor(page)).toHaveText("Behind the lock.");
});

test("deleting the only user goes back to the door, which offers to create one", async ({ page }) => {
  await signUp(page);
  await page.locator("#open-settings").click();
  await page.locator('#settings [data-tab="security"]').click();
  await page.locator("#delete-user").click();

  const form = page.locator("#delete-user-form");
  await expect(form).toBeVisible();
  const submit = form.locator("button[type=submit]");
  await form.locator("input[type=password]").fill(PASSWORD);
  // The red button waits until the person says they understand.
  await expect(submit).toBeDisabled();
  await form.locator(".check input[type=checkbox]").check();
  await submit.click();

  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("#lock-screen")).toBeVisible();
  const card = page.locator("#lock-card");
  await expect(card.locator("h1")).toHaveText("Your safe space");
  // The "create" view: a username and the new password twice, and no way back to signing in.
  await expect(card.locator("input[type=password]")).toHaveCount(2);
  await expect(card.getByRole("button", { name: "I already have a username" })).toHaveCount(0);
});

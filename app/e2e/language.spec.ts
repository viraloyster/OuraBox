import { editor, expect, signUp, test, typeAtEnd } from "./fixtures";

test("choosing Spanish in Settings reloads the interface in Spanish", async ({ page }) => {
  await signUp(page);
  await page.locator("#open-settings").click();
  await page.locator('#settings [data-tab="language"]').click();
  const spanish = page.locator("#language-choices").getByRole("radio", { name: "Español" });

  // Choosing it saves everything and reloads the window.
  await Promise.all([page.waitForEvent("load"), spanish.click()]);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  // The browser preview keeps nothing across a reload, so the door is back
  // at the start: in Spanish now.
  const card = page.locator("#lock-card");
  await expect(card.locator("h1")).toHaveText("Tu espacio seguro");
  await expect(card.locator("button[type=submit]")).toHaveText("Crear mi espacio");

  // And the app behind it too, all the way to saving.
  await signUp(page, "Ada", "Primer proyecto", { navigate: false });
  await expect(page.locator("#welcome-start")).toHaveText("Empezar");
  await typeAtEnd(page, "Hola.");
  await expect(editor(page)).toHaveText("Hola.");
  await expect(page.locator("#status")).toHaveText("Guardado");
});

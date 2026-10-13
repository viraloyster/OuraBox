import { beforeAll, describe, expect, it, vi } from "vitest";

// The door looks for its elements when the module loads.
document.body.innerHTML = `<div id="app"></div><div id="lock-screen" hidden><form id="lock-card"></form></div>`;

const { showLock } = await import("./lock");
const { storage } = await import("../core/storage");

const card = () => document.getElementById("lock-card") as HTMLFormElement;
const visibleInputs = () => [...card().querySelectorAll<HTMLInputElement>("input:not([hidden])")];
const button = (text: string) => [...card().querySelectorAll("button")].find((b) => b.textContent === text)!;

describe("the door after a lock", () => {
  beforeAll(async () => {
    await storage.createVault("Ana", "a long phrase");
    await storage.lock();
  });

  it("names who locked it and asks only for the password", async () => {
    const opened = vi.fn();
    showLock("locked", opened, true, "Ana");
    expect(card().querySelector("h1")?.textContent).toBe("Locked");
    expect(card().querySelector(".lock-text")?.textContent).toContain("Ana");
    expect(visibleInputs().map((input) => input.type)).toEqual(["password"]);

    visibleInputs()[0].value = "not the password";
    card().requestSubmit();
    await vi.waitFor(() => expect(card().querySelector(".lock-error")?.textContent).toBe("That password doesn't open this space. Try again, calmly."));

    visibleInputs()[0].value = "a long phrase";
    card().requestSubmit();
    await vi.waitFor(() => expect(opened).toHaveBeenCalled());
    expect((await storage.status()).user).toBe("Ana");
    await storage.lock();
  });

  it("lets someone else sign in, and recover with the name already there", () => {
    showLock("locked", () => {}, true, "Ana");
    button("Forgot your password?").click();
    expect(visibleInputs()[0].value).toBe("Ana");
    button("Back").click();
    expect(card().querySelector("h1")?.textContent).toBe("Locked");
    button("Sign in as someone else").click();
    expect(visibleInputs().map((input) => input.autocomplete)).toEqual(["username", "current-password"]);
    expect(visibleInputs()[0].value).toBe("");
  });
});

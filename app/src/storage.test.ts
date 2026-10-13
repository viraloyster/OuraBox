import { describe, expect, it } from "vitest";
import { browserPreviewStorage, isAppError } from "./storage";

// The browser preview imitates the rules of the Rust core.
describe("browserPreviewStorage", () => {
  it("rejects a stale save with a conflict", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    const document = await storage.create();
    await storage.save({ ...document, html: "<p>new</p>" });
    const error = await storage.save({ ...document, html: "<p>old</p>" }).catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("conflict");
    expect((await storage.load(document.id)).html).toBe("<p>new</p>");
  });

  it("refuses everything while locked", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    await storage.lock();
    const error = await storage.list().catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("locked");
  });

  it("moves documents between projects without changing their revision", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    const project = await storage.createProject("  Garden ");
    expect(project.name).toBe("Garden");
    const note = await storage.create({ project: project.id, kind: "note" });
    expect(note.kind).toBe("note");
    const moved = await storage.move(note.id, null);
    expect(moved[0].revision).toBe(note.revision);
    // A pane open with old data saves without a conflict and without undoing the change.
    const saved = await storage.save({ ...note, html: "<p>still here</p>" });
    expect(saved.project).toBeNull();
    await storage.move(note.id, project.id);
    // As in the core: a project is deleted only from the Trash, with its documents.
    await expect(storage.deleteProject(project.id)).rejects.toMatchObject({ code: "invalid_input" });
    expect((await storage.trashProject(project.id, true)).trashedAt).toBeGreaterThan(0);
    const list = await storage.deleteProject(project.id);
    expect(list.find((s) => s.id === note.id)).toBeUndefined();
    expect(await storage.projects()).toEqual([]);
  });

  it("sends documents to the trash with their roots and brings them back", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    const project = await storage.createProject("Garden");
    const top = await storage.create({ project: project.id });
    const child = await storage.create({ parent: top.id });
    const changed = await storage.trash(top.id, true);
    expect(changed.map((s) => s.id).sort()).toEqual([top.id, child.id].sort());
    expect(changed.every((s) => s.trashedAt > 0)).toBe(true);
    // Saving does not take it out of the Trash.
    const saved = await storage.save({ ...(await storage.load(top.id)), html: "<p>x</p>" });
    expect(saved.trashedAt).toBeGreaterThan(0);
    expect((await storage.trash(top.id, false)).every((s) => s.trashedAt === 0)).toBe(true);
  });
});

describe("users in the browser preview", () => {
  it("gives each user their own space, entered with user and password", async () => {
    const storage = browserPreviewStorage();
    expect((await storage.status()).state).toBe("new");
    await storage.createVault("Ana", "a long phrase");
    expect(await storage.status()).toMatchObject({ state: "unlocked", user: "Ana" });
    await storage.create();
    await storage.lock();
    await storage.createVault("Beto", "another long phrase");
    expect(await storage.list()).toEqual([]);
    await storage.lock();
    await expect(storage.unlock("Nobody", "a long phrase")).rejects.toMatchObject({
      code: "wrong_password",
      key: "wrong_username_or_password",
      message: "Wrong username or password.",
    });
    await expect(storage.unlock("Ana", "another long phrase")).rejects.toMatchObject({ key: "wrong_username_or_password" });
    await expect(storage.createVault("ANA", "another long phrase")).rejects.toMatchObject({ code: "invalid_input" });
    await storage.unlock("  ana ", "a long phrase");
    expect(await storage.list()).toHaveLength(1);
  });

  it("deletes a user only with their password, and keeps the others", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    await storage.create();
    await storage.lock();
    await storage.createVault("Beto", "another long phrase");
    await expect(storage.deleteUser("a long phrase")).rejects.toMatchObject({ key: "wrong_password" });
    expect((await storage.status()).state).toBe("unlocked");
    await storage.deleteUser("another long phrase");
    expect(await storage.status()).toMatchObject({ state: "locked", user: null });
    await expect(storage.unlock("Beto", "another long phrase")).rejects.toMatchObject({ key: "wrong_username_or_password" });
    await storage.unlock("Ana", "a long phrase");
    expect(await storage.list()).toHaveLength(1);
    await storage.deleteUser("a long phrase");
    expect((await storage.status()).state).toBe("new");
    await expect(storage.deleteUser("a long phrase")).rejects.toMatchObject({ code: "locked" });
  });
});

describe("roots in the browser preview", () => {
  it("grow under a document, move as a branch and survive their parent", async () => {
    const storage = browserPreviewStorage();
    await storage.createVault("Ana", "a long phrase");
    const project = await storage.createProject("Research");
    const top = await storage.create({ project: project.id });
    const child = await storage.create({ parent: top.id, kind: "note" });
    expect(child.project).toBe(project.id);
    expect(child.kind).toBe("file");
    const grandchild = await storage.create({ parent: child.id });
    expect((await storage.map(project.id)).length).toBe(3);
    const changed = await storage.move(child.id, null);
    expect(changed.map((s) => s.id)).toEqual([child.id, grandchild.id]);
    expect(changed[0].parent).toBeNull();
    await storage.remove(child.id);
    const list = await storage.list();
    expect(list.find((s) => s.id === grandchild.id)?.parent).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildIndex, distance, plain, search, sound } from "./search";

const docs = buildIndex([
  { id: "a", title: "Bichos del jardín", text: "Ayer vi un cienpies enorme debajo de la maceta." },
  { id: "b", title: "Huerta urbana", text: "Probar tomates y albahaca en el balcón.\nRegar cada dos días." },
  { id: "c", title: "Ciempiés", text: "Ideas para un cuento infantil." },
  { id: "d", title: "Vacaciones", text: "Viajar a la costa en verano." },
]);

const ids = (query: string, options = {}) => search(docs, query, options).map((r) => r.id);

describe("search", () => {
  it("ignores accents and case", () => {
    expect(plain("Ciempiés")).toBe("ciempies");
    expect(ids("BALCON")).toEqual(["b"]);
  });

  it("finds words written differently", () => {
    // The usual example: "ciempies" finds the misspelled "cienpies".
    expect(ids("ciempies")).toEqual(expect.arrayContaining(["a", "c"]));
    expect(ids("cienpies")).toEqual(expect.arrayContaining(["a", "c"]));
    // Sounds the same: v/b, s/z/c, silent h.
    expect(sound("vacasiones")).toBe(sound("bacaciones"));
    expect(ids("bacasiones")).toEqual(["d"]);
    expect(ids("albaca")).toEqual(["b"]);
    // One letter changed or two swapped.
    expect(ids("tomtaes")).toEqual(["b"]);
  });

  it("matches while typing", () => {
    expect(ids("alba")).toEqual(["b"]);
    expect(ids("ciemp")).toEqual(expect.arrayContaining(["a", "c"]));
  });

  it("needs every word and puts title matches first", () => {
    expect(ids("regar tomates")).toEqual(["b"]);
    expect(ids("regar vacaciones")).toEqual([]);
    expect(ids("ciempies")[0]).toBe("c");
  });

  it("can search only titles or only some documents", () => {
    expect(ids("maceta", { titlesOnly: true })).toEqual([]);
    expect(ids("huerta", { titlesOnly: true })).toEqual(["b"]);
    expect(ids("ciempies", { ids: new Set(["a"]) })).toEqual(["a"]);
  });

  it("does not match unrelated short words", () => {
    expect(ids("sol")).toEqual([]);
    expect(distance("casa", "masa", 1)).toBe(1);
    expect(distance("casa", "perro", 1)).toBe(2);
  });

  it("returns a snippet with the match highlighted", () => {
    const [result] = search(docs, "cienpies", { ids: new Set(["a"]) });
    const hit = result.snippetMatches[0];
    expect(result.snippet.slice(hit.start, hit.end)).toBe("cienpies");
    const [titled] = search(docs, "jardin");
    expect("Bichos del jardín".slice(titled.titleMatches[0].start, titled.titleMatches[0].end)).toBe("jardín");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";
import en from "./locales/en";
import es from "./locales/es";
import pt from "./locales/pt";
import { detectLocale, errorText, hasMessage, t, translate, translateDom, useMessages, type Plural } from "./i18n";

type Tree = { [key: string]: string | Plural | Tree };

/** Every key with its text: plurals give two entries ("key#one", "key#other"). */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") out.set(path, value);
    else if ("one" in value && "other" in value && typeof value.one === "string") {
      out.set(`${path}#one`, value.one);
      out.set(`${path}#other`, value.other as string);
    } else for (const [k, v] of flatten(value as Tree, `${path}.`)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const languages = { es, pt } as unknown as Record<string, Tree>;
const english = flatten(en);

afterEach(() => useMessages("en", en));

describe("translations", () => {
  for (const [name, tree] of Object.entries(languages)) {
    const other = flatten(tree);

    it(`${name} has exactly the English keys`, () => {
      expect([...other.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it(`${name} uses the same placeholders as English`, () => {
      for (const [key, text] of english) {
        expect(placeholders(other.get(key) ?? ""), key).toEqual(placeholders(text));
      }
    });

    it(`${name} has no empty texts`, () => {
      for (const [key, text] of other) expect(text.trim(), key).not.toBe("");
    });
  }

  it("every key named in index.html exists", () => {
    const keys = [...indexHtml.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
    for (const key of keys) expect(hasMessage(key), key).toBe(true);
  });
});

describe("t", () => {
  it("fills placeholders and picks the plural form", () => {
    useMessages("en", { a: { hello: "Hi {name}", files: { one: "{count} file", other: "{count} files" } } });
    expect(translate("a.hello", { name: "Ana" })).toBe("Hi Ana");
    expect(translate("a.files", { count: 1 })).toBe("1 file");
    expect(translate("a.files", { count: 3 })).toBe("3 files");
    expect(translate("a.files", { count: 1200 })).toBe("1,200 files");
  });

  it("formats numbers in the current language", () => {
    useMessages("pt", { a: { files: { one: "{count} arquivo", other: "{count} arquivos" } } });
    expect(translate("a.files", { count: 1200 })).toBe("1.200 arquivos");
  });

  it("shows the key when a text is missing", () => {
    expect(translate("nothing.here")).toBe("nothing.here");
  });

  it("knows the generic error", () => {
    expect(t("errors.generic")).toBe("Something went wrong.");
  });
});

describe("errorText", () => {
  it("uses the translated text of a core error when there is one", () => {
    useMessages("es", es);
    expect(errorText({ code: "internal", message: "x", key: "generic" })).toBe("Algo salió mal.");
  });

  it("falls back to the core message, then to the generic text", () => {
    expect(errorText({ code: "io", message: "Disk full", key: "unknown_key" })).toBe("Disk full");
    expect(errorText(new Error("boom"))).toBe("Something went wrong.");
  });
});

describe("detectLocale", () => {
  afterEach(() => localStorage.clear());

  it("follows the first system language OuraBox speaks", () => {
    expect(detectLocale(["fr-FR", "pt-BR", "en"])).toBe("pt");
    expect(detectLocale(["es-419"])).toBe("es");
    expect(detectLocale(["de"])).toBe("en");
  });

  it("prefers the language the person chose", () => {
    localStorage.setItem("ourabox.locale", "es");
    expect(detectLocale(["pt-BR"])).toBe("es");
  });
});

describe("translateDom", () => {
  it("fills text and attributes", () => {
    useMessages("en", { h: { save: "Save", tip: "Saves now" } });
    document.body.innerHTML = `<button data-i18n="h.save" data-i18n-title="h.tip" data-i18n-aria-label="h.save" data-i18n-hint="h.tip">x</button>`;
    translateDom();
    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Save");
    expect(button.title).toBe("Saves now");
    expect(button.getAttribute("aria-label")).toBe("Save");
    expect(button.dataset.hint).toBe("Saves now");
  });
});

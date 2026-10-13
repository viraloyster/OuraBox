// Cleans a document's HTML before showing it.
//
// The editor saves HTML. If that HTML brought a <script> or an attribute like
// onerror, it could run code inside the app. That is why only the formatting
// tags the editor uses are kept, without any attribute, except the src of
// images, and only if it is an embedded image, the id of the root a marked
// phrase leads to, and a few formatting `data-` attributes (alignment, size,
// color, task lists, table formulas), each with a closed list of values. Never
// `style` or `class`: OuraBox's stylesheet decides the look.

const ALLOWED_TAGS = new Set([
  "P", "DIV", "BR", "H1", "H2", "H3", "B", "STRONG", "I", "EM", "U", "S", "STRIKE",
  "UL", "OL", "LI", "BLOCKQUOTE", "SPAN", "IMG", "HR",
  "TABLE", "TBODY", "TR", "TD", "TH",
]);

/** The formatting attributes that are kept: on which tags and with which values. */
const FORMAT_ATTRIBUTES: Array<{ name: string; tags: Set<string>; valid: (value: string) => boolean }> = [
  { name: "data-align", tags: new Set(["P", "DIV", "H1", "H2", "H3", "LI", "BLOCKQUOTE", "TD", "TH"]), valid: (v) => /^(center|right|justify)$/.test(v) },
  // The font size in points, like in Word (from 6 to 96); the names are from the first version.
  { name: "data-size", tags: new Set(["SPAN"]), valid: (v) => /^(small|large|huge|[6-9]|[1-8]\d|9[0-6])$/.test(v) },
  // A palette color by its name (it follows the sky) or any color as #rrggbb.
  { name: "data-color", tags: new Set(["SPAN"]), valid: (v) => /^(agua|coral|sol|alga|crepusculo|tenue|#[0-9a-f]{6})$/.test(v) },
  // The letter outline: its thickness, its color and whether the letter is hollow.
  { name: "data-outline", tags: new Set(["SPAN"]), valid: (v) => /^(fino|medio|grueso)$/.test(v) },
  { name: "data-outline-color", tags: new Set(["SPAN"]), valid: (v) => /^(texto|fondo|agua|coral|sol|alga|crepusculo)$/.test(v) },
  { name: "data-hollow", tags: new Set(["SPAN"]), valid: (v) => v === "true" },
  // Bold removed (or added) inside a heading.
  { name: "data-weight", tags: new Set(["SPAN"]), valid: (v) => v === "normal" || v === "bold" },
  { name: "data-list", tags: new Set(["UL"]), valid: (v) => v === "check" },
  { name: "data-checked", tags: new Set(["LI"]), valid: (v) => v === "true" },
  { name: "data-formula", tags: new Set(["TD", "TH"]), valid: isFormula },
  // A blank space between blocks, when adding or duplicating pages: only a height in pixels.
  { name: "data-space", tags: new Set(["DIV"]), valid: (v) => /^\d{1,7}$/.test(v) },
];

/** A table formula: starts with "=" and only has letters, numbers and arithmetic signs. */
export function isFormula(value: string): boolean {
  return value.length <= 300 && /^=[\p{L}\p{N}\s.,;:+\-*/^%()<>]*$/u.test(value);
}

// Tags that are removed with all their content.
const DROPPED_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT",
  "LINK", "META", "SVG", "MATH", "VIDEO", "AUDIO", "CANVAS", "FORM",
  "INPUT", "TEXTAREA", "SELECT", "BUTTON",
]);

const IMAGE_SRC = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;

/** The id of an image saved separately: the SHA-256 hash of its content. */
export function isAssetId(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id);
}

/** The id of a document: 32 hexadecimal characters. */
export function isDocumentId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

export function isSafeImageSrc(src: string): boolean {
  return IMAGE_SRC.test(src);
}

export function sanitizeHtml(html: string): string {
  // DOMParser creates an inert document: nothing runs or downloads.
  const source = new DOMParser().parseFromString(html, "text/html");
  const output = document.createElement("div");
  copyChildren(source.body, output);
  return output.innerHTML;
}

function copyChildren(from: Node, to: Node): void {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      to.appendChild(document.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = child as Element;
    const tag = element.tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) continue;

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown tag: the tag is dropped but its text is kept.
      copyChildren(element, to);
      continue;
    }

    if (tag === "IMG") {
      // An image is saved separately and the document only mentions it by its id
      // (data-asset). Older images came embedded in src.
      const src = element.getAttribute("src") ?? "";
      const asset = element.getAttribute("data-asset") ?? "";
      const safeSrc = isSafeImageSrc(src);
      const safeAsset = isAssetId(asset);
      if (safeSrc || safeAsset) {
        const image = document.createElement("img");
        if (safeAsset) image.setAttribute("data-asset", asset);
        if (safeSrc) image.setAttribute("src", src);
        to.appendChild(image);
      }
      continue;
    }

    const clean = document.createElement(tag.toLowerCase());
    for (const attribute of FORMAT_ATTRIBUTES) {
      const value = element.getAttribute(attribute.name);
      if (value !== null && attribute.tags.has(tag) && attribute.valid(value)) clean.setAttribute(attribute.name, value);
    }
    // Any color is painted from the checked attribute, never from a style that came in.
    const color = clean.getAttribute("data-color");
    if (color?.startsWith("#")) (clean).style.color = color;
    // Hollow letters are not spell-checked: the browser repaints a misspelled
    // word filled in, under its red line, and the letter would stop being hollow.
    if (clean.getAttribute("data-hollow") === "true") clean.setAttribute("spellcheck", "false");
    // A phrase marked as a root leads to that document.
    const root = tag === "SPAN" ? (element.getAttribute("data-root") ?? "") : "";
    if (isDocumentId(root)) {
      clean.setAttribute("data-root", root);
      clean.className = "root-link";
    }
    copyChildren(element, clean);
    to.appendChild(clean);
  }
}

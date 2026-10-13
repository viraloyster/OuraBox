// Taking something out of OuraBox to use elsewhere: a PDF (or printing it), an
// image of the drawing, or the text. Always at the person's request and where
// they choose: what is exported is no longer encrypted.

import { t } from "../core/i18n";
import { findSky, inkColor } from "../space/themes";
import type { Pane } from "./pane";
import { storage } from "../core/storage";

/** Paper colors: when printing or exporting, the drawing looks as it does on a clear day. */
const PAPER = findSky("despejado")!;
const paperColor = (color: string) => inkColor(color, PAPER);

/** A file name from the title. */
function fileName(pane: Pane): string {
  return (pane.document?.title || "OuraBox").slice(0, 60);
}

// ---------- Image ----------

interface Area {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The area the drawing and the text boxes take up on the page. */
function drawingArea(pane: Pane): Area | null {
  let area: Area | null = pane.ink.drawingBounds();
  for (const box of pane.boxes.get()) {
    const element = pane.pageElement.querySelector<HTMLElement>(`.text-box[data-id="${box.id}"]`);
    const height = element ? element.offsetHeight * box.scale : 30 * box.scale;
    const b = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + height };
    area = area
      ? { minX: Math.min(area.minX, b.minX), minY: Math.min(area.minY, b.minY), maxX: Math.max(area.maxX, b.maxX), maxY: Math.max(area.maxY, b.maxY) }
      : b;
  }
  return area;
}

/** Writes the text of the boxes onto the canvas, with the same size and the same line breaks. */
function drawBoxes(pane: Pane, ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const family = getComputedStyle(pane.editorElement).fontFamily;
  for (const box of pane.boxes.get()) {
    const element = pane.pageElement.querySelector<HTMLElement>(`.text-box[data-id="${box.id}"] .box-text`);
    if (!element) continue;
    const size = 17 * box.scale * scale;
    const lineHeight = size * 1.6;
    ctx.font = `${size}px ${family}`;
    ctx.fillStyle = PAPER.text;
    ctx.textBaseline = "top";
    const padX = 0.3 * size;
    const maxWidth = box.width * scale - padX * 2;
    let top = (box.y - y) * scale + 0.15 * size + (lineHeight - size) / 2;
    const left = (box.x - x) * scale + padX;
    for (const paragraph of element.innerText.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/(\s+)/)) {
        const next = line + word;
        if (line && ctx.measureText(next).width > maxWidth) {
          ctx.fillText(line.trimEnd(), left, top);
          top += lineHeight;
          line = word.trimStart();
        } else {
          line = next;
        }
      }
      ctx.fillText(line, left, top);
      top += lineHeight;
    }
  }
}

/** The drawing (with its text boxes) as a PNG image with a transparent
 *  background: good for a logo or an illustration. */
export async function exportImage(pane: Pane): Promise<string | null> {
  const area = drawingArea(pane);
  if (!area) return null;
  const pad = Math.max(area.maxX - area.minX, area.maxY - area.minY) * 0.04;
  const x = area.minX - pad;
  const y = area.minY - pad;
  const width = area.maxX - area.minX + pad * 2;
  const height = area.maxY - area.minY + pad * 2;
  // Nice and sharp: the long side is at least 1024 pixels and at most 4096.
  const longest = Math.max(width, height);
  const scale = Math.min(4096 / longest, Math.max(2, 1024 / longest));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("exporter.noCanvas"));
  pane.ink.renderTo(ctx, x, y, scale, paperColor);
  drawBoxes(pane, ctx, x, y, scale);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(t("exporter.imageFailed"));
  return storage.saveExport(fileName(pane), "png", new Uint8Array(await blob.arrayBuffer()));
}

// ---------- Text ----------

/** The page's text in Markdown: headings, lists, tasks, tables and emphasis. */
export function toMarkdown(html: string): string {
  const root = new DOMParser().parseFromString(html, "text/html").body;
  // Spaces go outside the marks: "**bold **" is not valid Markdown.
  const mark = (inner: string, marker: string) => {
    const match = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : inner;
  };
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as Element;
    const inner = [...element.childNodes].map(inline).join("");
    switch (element.tagName) {
      case "B":
      case "STRONG":
        return mark(inner, "**");
      case "I":
      case "EM":
        return mark(inner, "*");
      case "S":
      case "STRIKE":
        return mark(inner, "~~");
      case "BR":
        return "\n";
      case "IMG":
        return "";
      default:
        return inner;
    }
  };
  const blocks: string[] = [];
  const list = (element: Element, depth: number) => {
    let n = 1;
    for (const item of element.children) {
      if (item.tagName !== "LI") continue;
      const nested = [...item.children].filter((c) => c.tagName === "UL" || c.tagName === "OL");
      const text = [...item.childNodes].filter((c) => !nested.includes(c as Element)).map(inline).join("").trim();
      const check = element.getAttribute("data-list") === "check";
      const marker = element.tagName === "OL" ? `${n++}.` : check ? (item.getAttribute("data-checked") === "true" ? "- [x]" : "- [ ]") : "-";
      // The following lines of the same item are indented, to stay inside it.
      const indent = "  ".repeat(depth);
      blocks.push(`${indent}${marker} ${text.replace(/\n/g, `\n${indent}${" ".repeat(marker.length + 1)}`)}`);
      for (const child of nested) list(child, depth + 1);
    }
  };
  const block = (element: Element) => {
    switch (element.tagName) {
      case "H1":
        blocks.push("", `# ${inline(element).trim()}`, "");
        return;
      case "H2":
        blocks.push("", `## ${inline(element).trim()}`, "");
        return;
      case "H3":
        blocks.push("", `### ${inline(element).trim()}`, "");
        return;
      case "UL":
      case "OL":
        list(element, 0);
        blocks.push("");
        return;
      case "HR":
        blocks.push("", "---", "");
        return;
      case "BLOCKQUOTE":
        blocks.push(inline(element).trim().split("\n").map((line) => `> ${line}`).join("\n"));
        return;
      case "TABLE": {
        const rows = [...element.querySelectorAll("tr")].map((row) =>
          // A line break inside a cell must not split the row.
          [...row.children].map((cell) => inline(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>")),
        );
        if (!rows.length) return;
        const width = Math.max(...rows.map((r) => r.length));
        const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
        blocks.push("", line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line), "");
        return;
      }
      case "P":
      case "DIV": {
        // A div can hold other blocks inside (that's how the browser builds paragraphs).
        if ([...element.children].some((c) => /^(P|DIV|H[1-3]|UL|OL|TABLE|HR|BLOCKQUOTE)$/.test(c.tagName))) {
          for (const child of element.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) block(child as Element);
            else if (child.textContent?.trim()) blocks.push(inline(child).trim());
          }
          return;
        }
        blocks.push(inline(element).trim());
        return;
      }
      default:
        blocks.push(inline(element).trim());
    }
  };
  for (const child of root.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) block(child as Element);
    else if (child.textContent?.trim()) blocks.push(inline(child).trim());
  }
  return `${blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export async function exportText(pane: Pane): Promise<string | null> {
  const markdown = toMarkdown(pane.editorElement.innerHTML);
  return storage.saveExport(fileName(pane), "md", new TextEncoder().encode(markdown));
}

// ---------- PDF and print ----------

/** Prints the page, or saves it as PDF from the same dialog ("Save as PDF" or
 *  "Microsoft Print to PDF"). Only the page is printed, with paper colors. */
export function printPage(pane: Pane, after: () => void = () => {}): void {
  const page = pane.pageElement;
  // The drawing's canvases only cover the screen: for paper, the whole drawing
  // is painted once as an image over the page (one per layer: what is behind
  // the text and what is on top).
  // It is painted in bands as tall as a page, at double resolution: that way a
  // long file prints as sharp as a short one.
  const images: HTMLImageElement[] = [];
  if (pane.ink.drawingBounds()) {
    const width = page.offsetWidth;
    const height = page.offsetHeight;
    const band = pane.document?.kind === "file" ? pane.sheet.height : Math.min(height, 2000);
    const scale = 2;
    for (let top = 0; top < height; top += band) {
      const tall = Math.min(band, height - top);
      if (!pane.ink.touches(top, top + tall)) continue;
      for (const front of pane.ink.hasFront() ? [false, true] : [false]) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(tall * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        pane.ink.renderTo(ctx, 0, top, scale, paperColor, front);
        const image = document.createElement("img");
        image.className = front ? "print-ink front" : "print-ink behind";
        image.alt = "";
        image.src = canvas.toDataURL("image/png");
        image.style.width = `${width}px`;
        image.style.height = `${tall}px`;
        image.style.top = `${top}px`;
        page.appendChild(image);
        images.push(image);
      }
    }
  }
  // The paper has the size of the file's pages.
  const paper = document.createElement("style");
  if (pane.document?.kind === "file") {
    const { width, height } = pane.sheet;
    paper.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`;
    document.head.appendChild(paper);
  }
  document.body.classList.add("printing");
  pane.root.classList.add("print-target");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const image of images) image.remove();
    paper.remove();
    document.body.classList.remove("printing");
    pane.root.classList.remove("print-target");
    // Printing can leave the canvases blank in the browser: paint them again.
    requestAnimationFrame(after);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  // If the system doesn't tell us when it's done, clean up when the window gets focus again.
  window.setTimeout(() => window.addEventListener("focus", cleanup, { once: true }), 500);
  // Make sure the image is ready before opening the dialog.
  void Promise.all(images.map((image) => (image.complete ? Promise.resolve() : new Promise((done) => (image.onload = done))))).then(() => window.print());
}

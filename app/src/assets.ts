// Images saved apart from the document.
//
// On the page, an image is <img data-asset="id" src="data:…">. When saving,
// the document keeps only data-asset: that way each save is light and the same
// image is saved only once, even if it appears in several documents or in
// many versions of the history.

import { t } from "./i18n";
import { isAssetId } from "./sanitize";
import { storage } from "./storage";

/** Images already decrypted, so they are not requested again. Emptied on lock. */
const cache = new Map<string, string>();

export function clearAssetCache(): void {
  cache.clear();
}

/** Saves an image (as a data URL) apart and returns its id. */
export async function storeImage(dataUrl: string): Promise<string> {
  const [, mime, data] = /^data:([^;]+);base64,(.*)$/.exec(dataUrl) ?? [];
  if (!mime || !data) throw new Error("Invalid image");
  const id = await storage.putAsset(mime, data);
  cache.set(id, dataUrl);
  return id;
}

/** Shows the images the document only mentions by id. */
export async function hydrateImages(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll<HTMLImageElement>("img[data-asset]")].filter((img) => !img.getAttribute("src"));
  await Promise.all(
    images.map(async (image) => {
      const id = image.dataset.asset ?? "";
      try {
        let url = cache.get(id);
        if (!url) {
          const asset = await storage.getAsset(id);
          url = `data:${asset.mime};base64,${asset.data}`;
          cache.set(id, url);
        }
        image.src = url;
      } catch (error) {
        image.alt = t("images.openFailed");
        console.error(error);
      }
    }),
  );
}

/** Moves images that still come embedded (documents from before this change)
 *  to separate files. Returns whether anything changed. */
export async function adoptInlineImages(container: HTMLElement): Promise<boolean> {
  const inline = [...container.querySelectorAll<HTMLImageElement>("img:not([data-asset])")].filter((img) =>
    img.getAttribute("src")?.startsWith("data:"),
  );
  for (const image of inline) {
    try {
      image.dataset.asset = await storeImage(image.getAttribute("src")!);
    } catch (error) {
      console.error(error);
    }
  }
  return inline.length > 0;
}

/** The HTML to save: images saved apart lose their src. */
export function htmlForSaving(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  for (const image of copy.querySelectorAll<HTMLImageElement>("img[data-asset]")) {
    if (isAssetId(image.dataset.asset ?? "")) image.removeAttribute("src");
  }
  return copy.innerHTML;
}

// Prepares images to be saved inside the document.
//
// A phone photo can weigh several megabytes. It is scaled down to a reasonable
// size so documents stay light on modest computers.

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not available");
    ctx.drawImage(bitmap, 0, 0, width, height);
    // PNG keeps transparency (screenshots, drawings); JPEG weighs less for photos.
    return file.type === "image/png" || file.type === "image/gif"
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

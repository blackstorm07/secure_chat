import { attachmentMime } from "@/lib/validations";

const MAX_EDGE = 1920;
const QUALITY = 0.82;
const MIN_SAVINGS = 0.9;

export function shouldCompressImage(file: File): boolean {
  const mime = attachmentMime(file);
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

/**
 * Shrinks a still image before encryption. Animated GIFs are left unchanged.
 * The original file is kept when the browser cannot decode it or the result is not smaller.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!shouldCompressImage(file) || typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest < 1) return file;
    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const mime = outputMime(context, file, width, height);
    const blob = await canvasBlob(canvas, mime);
    if (!blob || blob.size >= file.size * MIN_SAVINGS) return file;
    return new File([blob], fileNameFor(file.name, mime), { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

function outputMime(context: CanvasRenderingContext2D, file: File, width: number, height: number): string {
  if (attachmentMime(file) === "image/jpeg") return "image/jpeg";
  return hasTransparency(context, width, height) ? "image/webp" : "image/jpeg";
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 255) < 255) return true;
  }
  return false;
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, QUALITY));
}

function fileNameFor(name: string, mime: string): string {
  const extension = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extension}`;
}

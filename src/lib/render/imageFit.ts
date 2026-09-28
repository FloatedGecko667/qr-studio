import { stripImageMetadata } from './imageStrip';

export type FitFormat = 'webp' | 'jpeg';

export interface FitOptions {
  format: FitFormat;
  /** Longest side upper bound in pixels. */
  maxEdge: number;
  /** Starting (highest) quality, 0-1. */
  maxQuality: number;
}

export interface FittedImage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  /** Encoder quality used, or null when the original file was kept. */
  quality: number | null;
}

const KEEP_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MIN_EDGE = 8;

async function encode(bitmap: ImageBitmap, w: number, h: number, mime: string, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // JPEG has no alpha channel: flatten onto white instead of black.
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * Shrinks and re-encodes an image until it is at most `budget` bytes, trying lower quality
 * before smaller dimensions. Keeps the original file when it already fits.
 */
export async function fitImage(file: Blob, budget: number, opts: FitOptions): Promise<FittedImage | null> {
  if (budget <= 0) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (KEEP_TYPES.includes(file.type) && longest <= opts.maxEdge) {
      const original = stripImageMetadata(new Uint8Array(await file.arrayBuffer()), file.type);
      if (original.length <= budget) return { bytes: original, mime: file.type, width: bitmap.width, height: bitmap.height, quality: null };
    }
    let mime = `image/${opts.format}`;
    const qualities = [1, 0.8, 0.6, 0.45, 0.3, 0.2].map((f) => Math.max(0.05, opts.maxQuality * f));
    for (let edge = Math.min(opts.maxEdge, longest); edge >= MIN_EDGE; edge = Math.floor(edge * 0.8)) {
      const scale = edge / longest;
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      for (const q of qualities) {
        let blob = await encode(bitmap, w, h, mime, q);
        // Browsers without a WebP encoder return PNG; fall back to JPEG.
        if (blob && blob.type !== mime) {
          mime = 'image/jpeg';
          blob = await encode(bitmap, w, h, mime, q);
        }
        if (!blob) continue;
        const bytes = stripImageMetadata(new Uint8Array(await blob.arrayBuffer()), mime);
        if (bytes.length <= budget) return { bytes, mime, width: w, height: h, quality: q };
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

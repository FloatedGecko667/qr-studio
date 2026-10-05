import { clearBackground } from './logoBackground';

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 512;

export type LogoError = 'type' | 'size' | 'decode';

/**
 * Re-encodes an uploaded raster image as a PNG data URL. Drawing through a canvas
 * drops metadata and anything that is not pixels. SVG uploads are rejected.
 */
export async function sanitizeImage(file: File, opts: { clearBackground?: boolean } = {}): Promise<{ dataUrl: string } | { error: LogoError }> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return { error: 'type' };
  if (file.size > LOGO_MAX_BYTES) return { error: 'size' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: 'decode' };
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (opts.clearBackground) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    clearBackground(data.data, data.width, data.height);
    ctx.putImageData(data, 0, 0);
  }
  return { dataUrl: canvas.toDataURL('image/png') };
}

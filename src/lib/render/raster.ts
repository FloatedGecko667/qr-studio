import { withPngDpi } from './png';

export type RasterFormat = 'png' | 'jpeg' | 'webp';
/** Download formats. PDF embeds the raster image at its printed size. */
export type OutputFormat = RasterFormat | 'svg' | 'pdf' | 'eps';

/** Safari's canvas area limit; larger requests fail silently there. */
export const MAX_CANVAS_PIXELS = 16_777_216;

export async function svgToCanvas(svg: string, width: number, height: number, background?: string): Promise<HTMLCanvasElement> {
  if (width * height > MAX_CANVAS_PIXELS) throw new RangeError('canvas-too-large');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function canvasToBlob(canvas: HTMLCanvasElement, format: RasterFormat, dpi?: number, quality = 0.92): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${format}`, quality));
  if (!blob) throw new Error('encode-failed');
  if (format !== 'png' || !dpi) return blob;
  const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}

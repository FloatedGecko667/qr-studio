import type { EncodedSymbol } from './encoder';
import { FONT_FAMILY } from './render/fontName';
import { outputSize, withSize } from './render/output';
import type { PdfImage, PdfPage } from './export/pdf';
import type { VectorSvg } from './export/vector';
import { canvasToBlob, MAX_CANVAS_PIXELS, svgToCanvas, type OutputFormat } from './render/raster';
import { renderSvg, type RenderStyle, type SvgResult } from './render/svg';
import type { OutputSettings, StyleSettings } from './settings';

export function renderStyle(style: StyleSettings, logoDataUrl: string | null, fontDataUrl: string | null): RenderStyle {
  return {
    quietZone: style.quietZone,
    fg: style.fg,
    bg: style.bg,
    transparent: style.transparent,
    overlayRatio: style.overlay === 'none' ? 0 : style.overlayRatio,
    logoDataUrl: style.overlay === 'logo' ? logoDataUrl : null,
    centerText: style.overlay === 'text' ? style.centerText : '',
    enclosure: style.enclosure,
    label: style.label,
    labelPosition: style.labelPosition,
    labelColor: style.labelColor,
    frameColor: style.frameColor,
    frameRadius: style.frameRadius,
    fontFamily: FONT_FAMILY,
    fontDataUrl,
    moduleShape: style.moduleShape,
    finderOuter: style.finderOuter,
    finderInner: style.finderInner,
    gradient: style.gradient,
    fg2: style.fg2,
    logoClear: style.logoClear,
  };
}

export function symbolSvgs(symbols: readonly EncodedSymbol[], style: RenderStyle): SvgResult[] {
  return symbols.map((s) => renderSvg(s, style));
}

export function extensionFor(output: Pick<OutputSettings, 'format'>): string {
  return output.format === 'jpeg' ? 'jpg' : output.format;
}

/** Produces the downloadable file for one rendered SVG. */
export async function exportBlob(r: SvgResult, output: OutputSettings, bg: string): Promise<Blob> {
  const size = outputSize(r, output);
  return exportSized(r.svg, size, output.format, output.unit === 'mm' ? output.dpi : undefined, output.quality, bg);
}

/** One PDF with a page per symbol, each at the output size (structured append, batches). */
export async function exportPdf(list: readonly SvgResult[], output: OutputSettings): Promise<Blob> {
  return svgsToPdf(list.map((r) => pdfSource(r.svg, outputSize(r, output), output.unit === 'mm' ? output.dpi : undefined)));
}

/** Writes `svg` at an already computed size: SVG with physical/pixel attributes, or a raster image. */
export async function exportSized(
  svg: string,
  size: { pxWidth: number; pxHeight: number; svgAttr: { width: string; height: string } },
  format: OutputFormat,
  dpi: number | undefined,
  quality: number,
  bg: string,
): Promise<Blob> {
  if (format === 'svg') return new Blob([withSize(svg, size.svgAttr)], { type: 'image/svg+xml' });
  if (format === 'pdf') return svgsToPdf([pdfSource(svg, size, dpi)]);
  if (format === 'eps') return svgToEps(pdfSource(svg, size, dpi));
  // JPEG has no alpha: flatten transparent areas onto the background colour.
  const canvas = await svgToCanvas(svg, size.pxWidth, size.pxHeight, format === 'jpeg' ? bg : undefined);
  return canvasToBlob(canvas, format, dpi, quality);
}

/** Page size used for PDFs when the output is specified in pixels (CSS pixels). */
export const PDF_PX_DPI = 96;

export interface PdfSource {
  svg: string;
  /** Output size in pixels at `dpi`; sets the printed page size unless `mm` is given. */
  pxWidth: number;
  pxHeight: number;
  dpi: number;
  /** Exact printed size, so rounding to whole pixels does not change the page size. */
  mm?: { width: number; height: number };
}

/** Page source for an exported size: mm sizes are kept exact, pixel sizes print at `dpi` (96 by default). */
export function pdfSource(svg: string, size: { pxWidth: number; pxHeight: number; svgAttr: { width: string; height: string } }, dpi: number | undefined): PdfSource {
  const mm = size.svgAttr.width.endsWith('mm') ? { width: parseFloat(size.svgAttr.width), height: parseFloat(size.svgAttr.height) } : undefined;
  return { svg, pxWidth: size.pxWidth, pxHeight: size.pxHeight, dpi: dpi ?? PDF_PX_DPI, mm };
}

const pagePt = (it: PdfSource, pageSizePt: (w: number, h: number, dpi: number) => { width: number; height: number }) =>
  it.mm ? { width: (it.mm.width / 25.4) * 72, height: (it.mm.height / 25.4) * 72 } : pageSizePt(it.pxWidth, it.pxHeight, it.dpi);

/** Overlays (text, logos) are rasterised at this resolution, within the canvas limit. */
const OVERLAY_DPI = 600;

/**
 * PDF with one page per SVG, each page at its printed size. Shapes are written as vectors and
 * text or images are drawn over them as a high-resolution transparent image. An SVG the vector
 * converter does not understand falls back to a raster page. The writer is loaded only when needed.
 */
export async function svgsToPdf(items: readonly PdfSource[]): Promise<Blob> {
  const [{ writePdf, pageSizePt }, { vectorizeSvg }] = await Promise.all([import('./export/pdf'), import('./export/vector')]);
  const pages: PdfPage[] = [];
  for (const it of items) {
    const page = pagePt(it, pageSizePt);
    let vector: VectorSvg | null = null;
    try {
      vector = vectorizeSvg(it.svg);
    } catch {
      vector = null;
    }
    if (!vector) {
      pages.push({ widthPt: page.width, heightPt: page.height, image: pixels(await svgToCanvas(it.svg, it.pxWidth, it.pxHeight)) });
      continue;
    }
    const overlay = vector.overlay ? await overlayImage(vector.overlay, it) : undefined;
    pages.push({ widthPt: page.width, heightPt: page.height, vector, overlay });
  }
  return new Blob([writePdf(pages) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** Overlay (text, logos) for a vector page, at OVERLAY_DPI within the canvas limit. */
async function overlayImage(svg: string, it: PdfSource): Promise<PdfImage> {
  const scale = Math.max(1, Math.min(Math.max(1, OVERLAY_DPI / it.dpi), Math.sqrt(MAX_CANVAS_PIXELS / (it.pxWidth * it.pxHeight))));
  return pixels(await svgToCanvas(svg, Math.round(it.pxWidth * scale), Math.round(it.pxHeight * scale)));
}

/**
 * Encapsulated PostScript at the printed size (same content as the vector PDF). The writer is
 * loaded only when needed.
 */
export async function svgToEps(it: PdfSource): Promise<Blob> {
  const [{ pageSizePt }, { vectorizeSvg }, { writeEps }] = await Promise.all([import('./export/pdf'), import('./export/vector'), import('./export/eps')]);
  const page = pagePt(it, pageSizePt);
  let vector: VectorSvg;
  try {
    vector = vectorizeSvg(it.svg);
  } catch {
    // Not an app SVG: the whole drawing becomes the (fully opaque) overlay.
    vector = { width: 1, height: 1, shapes: [], overlay: it.svg };
  }
  const overlay = vector.overlay ? await overlayImage(vector.overlay, it) : undefined;
  return new Blob([writeEps({ widthPt: page.width, heightPt: page.height, vector, overlay })], { type: 'application/postscript' });
}

function pixels(canvas: HTMLCanvasElement): PdfImage {
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, rgba: image.data };
}

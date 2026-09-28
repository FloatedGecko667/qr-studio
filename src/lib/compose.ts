import type { EncodedSymbol } from './encoder';
import { FONT_FAMILY } from './render/fontName';
import { outputSize, withSize } from './render/output';
import { canvasToBlob, svgToCanvas, type RasterFormat } from './render/raster';
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

/** Writes `svg` at an already computed size: SVG with physical/pixel attributes, or a raster image. */
export async function exportSized(
  svg: string,
  size: { pxWidth: number; pxHeight: number; svgAttr: { width: string; height: string } },
  format: RasterFormat | 'svg',
  dpi: number | undefined,
  quality: number,
  bg: string,
): Promise<Blob> {
  if (format === 'svg') return new Blob([withSize(svg, size.svgAttr)], { type: 'image/svg+xml' });
  // JPEG has no alpha: flatten transparent areas onto the background colour.
  const canvas = await svgToCanvas(svg, size.pxWidth, size.pxHeight, format === 'jpeg' ? bg : undefined);
  return canvasToBlob(canvas, format, dpi, quality);
}

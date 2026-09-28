import type { OutputSettings } from '../settings';
import type { SvgResult } from './svg';

export interface OutputSize {
  pxWidth: number;
  pxHeight: number;
  /** Physical module size when printing in mm mode. */
  moduleMm: number | null;
  /** width/height attributes for exported SVG. */
  svgAttr: { width: string; height: string };
}

export function outputSize(r: Pick<SvgResult, 'widthUnits' | 'heightUnits'>, out: OutputSettings): OutputSize {
  if (out.unit === 'px') {
    const pxWidth = r.widthUnits * out.modulePx;
    const pxHeight = r.heightUnits * out.modulePx;
    return { pxWidth, pxHeight, moduleMm: null, svgAttr: { width: `${pxWidth}`, height: `${pxHeight}` } };
  }
  const mmHeight = (out.sizeMm * r.heightUnits) / r.widthUnits;
  const pxWidth = Math.round((out.sizeMm / 25.4) * out.dpi);
  const pxHeight = Math.round((mmHeight / 25.4) * out.dpi);
  return {
    pxWidth,
    pxHeight,
    moduleMm: out.sizeMm / r.widthUnits,
    svgAttr: { width: `${round(out.sizeMm)}mm`, height: `${round(mmHeight)}mm` },
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Places several SVGs side by side (structured append overview), wrapping every `perRow`. */
export function composeSheet(items: SvgResult[], perRow = 4, gap = 4): SvgResult {
  const cellW = Math.max(...items.map((i) => i.widthUnits));
  const cellH = Math.max(...items.map((i) => i.heightUnits));
  const cols = Math.min(perRow, items.length);
  const rows = Math.ceil(items.length / cols);
  const widthUnits = cols * cellW + (cols - 1) * gap;
  const heightUnits = rows * cellH + (rows - 1) * gap;
  const inner = items
    .map((it, i) => {
      const x = (i % cols) * (cellW + gap);
      const y = Math.floor(i / cols) * (cellH + gap);
      return it.svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${it.widthUnits}" height="${it.heightUnits}" `);
    })
    .join('');
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" shape-rendering="crispEdges">${inner}</svg>`,
    widthUnits,
    heightUnits,
  };
}

/** Replaces the root element's size attributes with physical/pixel ones for export. */
export function withSize(svg: string, attr: { width: string; height: string }): string {
  return svg.replace(/^<svg /, `<svg width="${attr.width}" height="${attr.height}" `);
}

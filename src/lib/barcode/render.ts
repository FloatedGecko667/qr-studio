// SVG for linear barcodes in module units (1 unit = narrow bar width). User text is XML-escaped
// and colours are validated, as for QR output.
import { FONT_FAMILY } from '../render/fontName';
import { escapeXml, modulesPath, safeColor, type SvgResult } from '../render/svg';
import type { BarcodeSymbol, FourState, FourStateSymbol, LinearSymbol, MatrixSymbol, StackedSymbol } from './types';

export type BarcodeFont = 'jetbrains' | 'sans' | 'serif' | 'mono';
export type Bearer = 'none' | 'bars' | 'frame';

export interface BarcodeStyle {
  /** Bar height in modules. */
  height: number;
  /** Left/right quiet zone in modules; 'auto' uses the symbology minimum. */
  quietZone: number | 'auto';
  /** Top/bottom margin in modules. */
  marginY: number;
  showText: boolean;
  textPosition: 'bottom' | 'top';
  /** Font size in modules. */
  fontSize: number;
  /** Space between bars and text in modules. */
  textGap: number;
  font: BarcodeFont;
  fg: string;
  bg: string;
  transparent: boolean;
  /** Bearer bars (ITF-14): none, top and bottom, or a full frame. */
  bearer: Bearer;
}

export const BEARER_WIDTH = 3;
/** Approximate advance of a digit relative to the font size. */
const CHAR_WIDTH = 0.6;
/** Baseline offset from the top of the text band. */
const ASCENT = 0.78;

const FONT_STACKS: Record<BarcodeFont, string> = {
  jetbrains: `'${FONT_FAMILY}', monospace`,
  sans: 'Helvetica, Arial, sans-serif',
  serif: "'Times New Roman', Times, serif",
  mono: "'Courier New', Courier, monospace",
};

const r = (n: number) => Math.round(n * 1000) / 1000;

function textWidth(s: string, size: number): number {
  return Array.from(s).length * size * CHAR_WIDTH;
}

/** Extra room needed beside the bars for EAN/UPC digits printed outside the guards. */
function retailOverflow(sym: LinearSymbol, fs: number): [number, number] {
  let left = 0;
  let right = 0;
  for (const p of sym.parts) {
    const size = p.small ? fs * 0.8 : fs;
    const w = textWidth(p.text, size);
    const start = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
    left = Math.max(left, -start);
    right = Math.max(right, start + w - sym.width);
  }
  return [left, right];
}

export function renderBarcodeSvg(sym: BarcodeSymbol, s: BarcodeStyle, fontDataUrl: string | null = null): SvgResult {
  switch (sym.kind) {
    case 'matrix':
      return renderMatrix(sym, s, fontDataUrl);
    case 'stacked':
      return renderStacked(sym, s, fontDataUrl);
    case 'fourstate':
      return renderFourState(sym, s, fontDataUrl);
    default:
      return renderLinear(sym, s, fontDataUrl);
  }
}

function openSvg(widthUnits: number, heightUnits: number, s: BarcodeStyle, fontDataUrl: string | null): string[] {
  // preserveAspectRatio="none": a rounded raster height must never shift the bars sideways.
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" preserveAspectRatio="none" style="color-scheme:only light">`];
  if (s.showText && s.font === 'jetbrains' && fontDataUrl) {
    out.push(`<style>@font-face{font-family:'${FONT_FAMILY}';src:url(${fontDataUrl}) format("woff2");}</style>`);
  }
  if (!s.transparent) out.push(`<rect width="${widthUnits}" height="${heightUnits}" fill="${safeColor(s.bg, '#ffffff')}"/>`);
  return out;
}

/** Centred human-readable text, squeezed with textLength when it is wider than `room`. */
function centredText(value: string, cx: number, top: number, size: number, room: number, s: BarcodeStyle): string {
  const w = textWidth(value, size);
  const fit = w > room ? ` textLength="${r(room)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${r(cx)}" y="${r(top + size * ASCENT)}" font-size="${r(size)}" text-anchor="middle" fill="${safeColor(s.fg, '#000000')}" font-family="${escapeXml(FONT_STACKS[s.font])}"${fit}>${escapeXml(value)}</text>`;
}

/** Data Matrix: square quiet zone on all sides, optional text outside it. */
function renderMatrix(sym: MatrixSymbol, s: BarcodeStyle, fontDataUrl: string | null): SvgResult {
  const q = s.quietZone === 'auto' ? sym.quiet[0] : s.quietZone;
  // Long text shrinks to the symbol width instead of being squeezed.
  const fit = (sym.width + q * 2 - 1) / Math.max(1, Array.from(sym.hrt).length * CHAR_WIDTH);
  const fs = Math.min(s.fontSize, Math.floor(fit * 100) / 100);
  const band = s.showText ? fs + s.textGap : 0;
  const top = s.showText && s.textPosition === 'top';
  const widthUnits = sym.width + q * 2;
  const heightUnits = sym.height + q * 2 + band;
  const y0 = q + (top ? band : 0);
  const out = openSvg(widthUnits, heightUnits, s, fontDataUrl);
  out.push(`<path fill="${safeColor(s.fg, '#000000')}" shape-rendering="crispEdges" d="${modulesPath(sym, q, y0)}"/>`);
  if (s.showText) {
    const textTop = top ? s.textGap : y0 + sym.height + q;
    out.push(centredText(sym.hrt, widthUnits / 2, textTop, fs, widthUnits - 1, s));
  }
  out.push('</svg>');
  return { svg: out.join(''), widthUnits, heightUnits };
}

function renderLinear(sym: LinearSymbol, s: BarcodeStyle, fontDataUrl: string | null): SvgResult {
  const body = linearElements(sym, s, 0);
  const out = openSvg(body.widthUnits, body.heightUnits, s, fontDataUrl);
  out.push(...body.elements, '</svg>');
  return { svg: out.join(''), widthUnits: body.widthUnits, heightUnits: body.heightUnits };
}

/** Bars, bearer bars and text of one linear symbol, drawn `oy` modules below the top. */
function linearElements(sym: LinearSymbol, s: BarcodeStyle, oy: number): { elements: string[]; widthUnits: number; heightUnits: number } {
  const fg = safeColor(s.fg, '#000000');
  const fs = s.showText ? s.fontSize : 0;
  const band = s.showText ? fs + s.textGap : 0;
  const retail = sym.layout === 'retail' && s.showText;
  const bottomText = s.showText && s.textPosition === 'bottom';
  const bw = s.bearer === 'none' ? 0 : BEARER_WIDTH;
  const sideBw = s.bearer === 'frame' ? BEARER_WIDTH : 0;

  let [ql, qr] = s.quietZone === 'auto' ? sym.quiet : [s.quietZone, s.quietZone];
  if (retail) {
    const [ol, or] = retailOverflow(sym, fs);
    // Whole modules keep every bar on the pixel grid of the raster output.
    ql = Math.max(ql, Math.ceil(ol + 1));
    qr = Math.max(qr, Math.ceil(or + 1));
  }
  const x0 = sideBw + ql;
  const widthUnits = r(sideBw * 2 + ql + sym.width + qr);

  const topBand = s.showText && !bottomText ? band : 0;
  const barsTop = oy + s.marginY + topBand + bw;
  const barsBottom = barsTop + s.height;
  // EAN/UPC guard bars reach halfway into the digits below them (not across a bearer bar).
  const guardBottom = retail && bottomText && !bw ? barsBottom + s.textGap + fs * 0.5 : barsBottom;
  const textTop = bottomText ? barsBottom + bw + s.textGap : oy + s.marginY;
  const heightUnits = r(barsBottom + bw + (bottomText ? band : 0) + s.marginY - oy);

  const out: string[] = [];
  const family = FONT_STACKS[s.font];

  const d: string[] = [];
  const addonTop = s.showText && s.textPosition === 'bottom' ? barsTop + band : barsTop;
  for (const b of sym.bars) {
    const top = b.kind === 'addon' ? addonTop : barsTop;
    const bottom = b.kind === 'guard' || b.kind === 'addon' ? guardBottom : barsBottom;
    d.push(`M${r(x0 + b.x)} ${r(top)}h${r(b.w)}v${r(bottom - top)}h${r(-b.w)}z`);
  }
  out.push(`<path fill="${fg}" shape-rendering="crispEdges" d="${d.join('')}"/>`);
  if (bw) {
    const b: string[] = [];
    const left = sideBw ? 0 : x0 - ql;
    const right = sideBw ? widthUnits : x0 + sym.width + qr;
    const outerTop = barsTop - bw;
    if (sideBw) {
      // Frame: outer rectangle minus the inner area.
      b.push(`M${left} ${outerTop}H${r(right)}V${r(barsBottom + bw)}H${left}z`);
      b.push(`M${bw} ${r(barsTop)}V${r(barsBottom)}H${r(right - bw)}V${r(barsTop)}z`);
    } else {
      b.push(`M${r(left)} ${r(outerTop)}H${r(right)}v${bw}H${r(left)}z`);
      b.push(`M${r(left)} ${r(barsBottom)}H${r(right)}v${bw}H${r(left)}z`);
    }
    // Separate path: the frame's inner hole must not cut through the bars.
    out.push(`<path fill="${fg}" fill-rule="evenodd" shape-rendering="crispEdges" d="${b.join('')}"/>`);
  }

  if (s.showText) {
    const text = (x: number, y: number, size: number, anchor: string, value: string, fit?: number) =>
      `<text x="${r(x)}" y="${r(y)}" font-size="${r(size)}" text-anchor="${anchor}"${fit ? ` textLength="${r(fit)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escapeXml(value)}</text>`;
    const texts: string[] = [];
    if (retail) {
      for (const p of sym.parts) {
        const size = p.small ? fs * 0.8 : fs;
        const y = p.addon ? (bottomText ? barsTop + fs * ASCENT : textTop + fs * ASCENT) : textTop + fs * ASCENT;
        texts.push(text(x0 + p.x, y, size, p.anchor, p.text));
      }
    } else {
      const w = textWidth(sym.hrt, fs);
      const room = sym.width + Math.min(ql, qr);
      texts.push(text(x0 + sym.width / 2, textTop + fs * ASCENT, fs, 'middle', sym.hrt, w > room ? room : undefined));
    }
    out.push(`<g fill="${fg}" font-family="${escapeXml(family)}">${texts.join('')}</g>`);
  }
  return { elements: out, widthUnits, heightUnits };
}

/**
 * 書籍JAN: caption lines on top, then each row with its digits below, separated by `gap`.
 * Rows always have their digits below and no bearer bars.
 */
function renderStacked(sym: StackedSymbol, s: BarcodeStyle, fontDataUrl: string | null): SvgResult {
  const rowStyle: BarcodeStyle = { ...s, bearer: 'none', marginY: 0, textPosition: 'bottom' };
  const lineHeight = s.fontSize * 1.2;
  const captionBand = s.showText ? sym.captions.length * lineHeight + s.textGap : 0;
  let y = s.marginY + captionBand;
  const elements: string[] = [];
  let widthUnits = 0;
  sym.rows.forEach((row, i) => {
    const body = linearElements(row, rowStyle, y);
    elements.push(...body.elements);
    widthUnits = Math.max(widthUnits, body.widthUnits);
    y += body.heightUnits + (i < sym.rows.length - 1 ? sym.gap : 0);
  });
  const heightUnits = r(y + s.marginY);
  const out = openSvg(widthUnits, heightUnits, s, fontDataUrl);
  if (s.showText) {
    // Long captions (the ISBN) are fitted to the symbol width rather than cut off.
    for (const [i, c] of sym.captions.entries()) out.push(centredText(c, widthUnits / 2, s.marginY + i * lineHeight, s.fontSize, widthUnits - 2, s));
  }
  out.push(...elements, '</svg>');
  return { svg: out.join(''), widthUnits, heightUnits };
}

/**
 * Four-state bars in units of the bar width: pitch 2, full bar 6 tall, half bars 4, tracker 2
 * (Japan Post at 10 pt: 0.6 mm bars, 1.2 mm pitch, 3.6 / 2.4 / 1.2 mm heights).
 */
const FOUR_STATE_SPAN: Record<FourState, [number, number]> = { F: [0, 6], A: [0, 4], D: [2, 6], T: [2, 4] };

function renderFourState(sym: FourStateSymbol, s: BarcodeStyle, fontDataUrl: string | null): SvgResult {
  const [ql, qr] = s.quietZone === 'auto' ? sym.quiet : [s.quietZone, s.quietZone];
  const fs = s.showText ? s.fontSize : 0;
  const band = s.showText ? fs + s.textGap : 0;
  const top = s.showText && s.textPosition === 'top';
  const barsTop = Math.max(s.marginY, ql) + (top ? band : 0);
  const barsWidth = sym.bars.length * 2 - 1;
  const widthUnits = ql + barsWidth + qr;
  const heightUnits = r(barsTop + 6 + (top ? 0 : band) + Math.max(s.marginY, ql));
  const out = openSvg(widthUnits, heightUnits, s, fontDataUrl);
  const d = sym.bars.map((b, i) => {
    const [y0, y1] = FOUR_STATE_SPAN[b];
    return `M${ql + i * 2} ${r(barsTop + y0)}h1v${y1 - y0}h-1z`;
  });
  out.push(`<path fill="${safeColor(s.fg, '#000000')}" shape-rendering="crispEdges" d="${d.join('')}"/>`);
  if (s.showText) {
    const textTop = top ? Math.max(s.marginY, ql) : barsTop + 6 + s.textGap;
    out.push(centredText(sym.hrt, widthUnits / 2, textTop, fs, widthUnits - 1, s));
  }
  out.push('</svg>');
  return { svg: out.join(''), widthUnits, heightUnits };
}

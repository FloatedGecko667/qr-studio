// SVG for linear barcodes in module units (1 unit = narrow bar width). User text is XML-escaped
// and colours are validated, as for QR output.
import { FONT_FAMILY } from '../render/fontName';
import { escapeXml, safeColor, type SvgResult } from '../render/svg';
import type { LinearSymbol } from './types';

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

export function renderBarcodeSvg(sym: LinearSymbol, s: BarcodeStyle, fontDataUrl: string | null = null): SvgResult {
  const fg = safeColor(s.fg, '#000000');
  const bg = safeColor(s.bg, '#ffffff');
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
  const barsTop = s.marginY + topBand + bw;
  const barsBottom = barsTop + s.height;
  // EAN/UPC guard bars reach halfway into the digits below them (not across a bearer bar).
  const guardBottom = retail && bottomText && !bw ? barsBottom + s.textGap + fs * 0.5 : barsBottom;
  const textTop = bottomText ? barsBottom + bw + s.textGap : s.marginY;
  const heightUnits = r(barsBottom + bw + (bottomText ? band : 0) + s.marginY);

  const out: string[] = [];
  // preserveAspectRatio="none": a rounded raster height must never shift the bars sideways.
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" preserveAspectRatio="none">`);
  const family = FONT_STACKS[s.font];
  if (s.showText && s.font === 'jetbrains' && fontDataUrl) {
    out.push(`<style>@font-face{font-family:'${FONT_FAMILY}';src:url(${fontDataUrl}) format("woff2");}</style>`);
  }
  if (!s.transparent) out.push(`<rect width="${widthUnits}" height="${heightUnits}" fill="${bg}"/>`);

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
  out.push('</svg>');
  return { svg: out.join(''), widthUnits, heightUnits };
}

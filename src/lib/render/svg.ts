// Builds the single SVG that is used for preview, SVG export and (rasterized) PNG/JPEG/WebP.
// All user-provided text is XML-escaped; images are passed in as re-encoded data URLs only.

import { finderOrigins, finderPath, shapedModulesPath, type FinderShape, type Gradient, type ModuleShape } from './shapes';

export type Enclosure = 'circle' | 'square' | 'none';
export type LabelPosition = 'top' | 'bottom';

export interface SymbolGrid {
  width: number;
  height: number;
  /** Row-major, 1 = dark. */
  modules: Uint8Array;
}

export interface RenderStyle {
  quietZone: number;
  fg: string;
  bg: string;
  transparent: boolean;
  /** Centre overlay size as a fraction of the shorter symbol side (0 = none). */
  overlayRatio: number;
  /** PNG data URL produced by `sanitizeImage` — never a user-supplied URL. */
  logoDataUrl: string | null;
  centerText: string;
  enclosure: Enclosure;
  label: string;
  labelPosition: LabelPosition;
  labelColor: string;
  frameColor: string;
  /** Frame corner radius in modules. */
  frameRadius: number;
  fontFamily: string;
  /** Optional base64 WOFF2 embedded via @font-face so the SVG is self-contained. */
  fontDataUrl: string | null;
  /** Design options; unset means square modules, square finders and a plain colour. */
  moduleShape?: ModuleShape;
  finderOuter?: FinderShape;
  finderInner?: FinderShape;
  gradient?: Gradient;
  /** Second colour of the gradient (the first is `fg`). */
  fg2?: string;
}

export interface SvgResult {
  svg: string;
  /** Size in module units; multiply by the module size to get pixels. */
  widthUnits: number;
  heightUnits: number;
}

const LABEL_BAND = 5;
const FRAME = 1;

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Only allow CSS hex colours so style values can never break out of attributes. */
export function safeColor(c: string, fallback: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

/** Path for all dark modules, merging horizontal runs. */
export function modulesPath(grid: SymbolGrid, ox: number, oy: number, skip?: (x: number, y: number) => boolean): string {
  const parts: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    let x = 0;
    while (x < grid.width) {
      const dark = (xx: number) => grid.modules[y * grid.width + xx] === 1 && !skip?.(xx, y);
      if (!dark(x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < grid.width && dark(x)) x++;
      parts.push(`M${start + ox} ${y + oy}h${x - start}v1h${start - x}z`);
    }
  }
  return parts.join('');
}

/** Square overlay in module coordinates (inclusive-exclusive), or null. */
export function overlayBox(grid: SymbolGrid, ratio: number): { x: number; y: number; size: number } | null {
  if (ratio <= 0) return null;
  let size = Math.round(Math.min(grid.width, grid.height) * ratio);
  if (size < 1) return null;
  // Keep the overlay centred on the module grid.
  if ((grid.width - size) % 2) size++;
  size = Math.min(size, grid.height);
  return { x: (grid.width - size) / 2, y: Math.floor((grid.height - size) / 2), size };
}

export function renderSvg(grid: SymbolGrid, s: RenderStyle, unitsAttr?: { width: string; height: string }): SvgResult {
  const fg = safeColor(s.fg, '#000000');
  const bg = safeColor(s.bg, '#ffffff');
  const frameColor = safeColor(s.frameColor, fg);
  const labelColor = safeColor(s.labelColor, bg);
  const q = s.quietZone;
  const hasLabel = s.label.trim().length > 0;
  const frame = hasLabel ? FRAME : 0;
  const band = hasLabel ? LABEL_BAND : 0;

  const innerW = grid.width + q * 2;
  const innerH = grid.height + q * 2;
  const widthUnits = innerW + frame * 2;
  const heightUnits = innerH + frame * 2 + band;
  const symbolX = frame + q;
  const symbolY = frame + q + (hasLabel && s.labelPosition === 'top' ? band : 0);

  const box = overlayBox(grid, s.logoDataUrl || s.centerText ? s.overlayRatio : 0);
  const inBox = box ? (x: number, y: number) => x >= box.x && x < box.x + box.size && y >= box.y && y < box.y + box.size : undefined;

  const font = escapeXml(s.fontFamily);
  const out: string[] = [];
  const size = unitsAttr ? ` width="${unitsAttr.width}" height="${unitsAttr.height}"` : '';
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}"${size} shape-rendering="crispEdges" style="color-scheme:only light">`,
  );
  if (s.fontDataUrl && (hasLabel || s.centerText)) {
    out.push(`<style>@font-face{font-family:${font};src:url(${s.fontDataUrl}) format("woff2");}</style>`);
  }
  if (hasLabel) {
    const innerY = frame + (s.labelPosition === 'top' ? band : 0);
    // Frame = rounded outer rectangle with the symbol area cut out, so transparency still works.
    out.push(
      `<path fill="${frameColor}" fill-rule="evenodd" d="${roundedRect(widthUnits, heightUnits, s.frameRadius)}M${frame} ${innerY}h${innerW}v${innerH}h${-innerW}z"/>`,
    );
    if (!s.transparent) out.push(`<rect x="${frame}" y="${innerY}" width="${innerW}" height="${innerH}" fill="${bg}"/>`);
    const textY = s.labelPosition === 'top' ? frame + band / 2 : frame + innerH + band / 2;
    out.push(
      `<text x="${widthUnits / 2}" y="${textY}" fill="${labelColor}" font-family="${font}, sans-serif" font-weight="700" font-size="${band * 0.6}" text-anchor="middle" dominant-baseline="central" textLength="${Math.min(innerW - 2, s.label.length * band * 0.62)}" lengthAdjust="spacingAndGlyphs">${escapeXml(s.label)}</text>`,
    );
  } else if (!s.transparent) {
    out.push(`<rect width="${widthUnits}" height="${heightUnits}" fill="${bg}"/>`);
  }
  out.push(...codeElements(grid, s, fg, symbolX, symbolY, inBox));

  if (box) {
    const bx = symbolX + box.x;
    const by = symbolY + box.y;
    const cx = bx + box.size / 2;
    const cy = by + box.size / 2;
    if (s.logoDataUrl) {
      out.push(`<rect x="${bx}" y="${by}" width="${box.size}" height="${box.size}" fill="${bg}"/>`);
      const pad = box.size * 0.08;
      out.push(
        `<image x="${bx + pad}" y="${by + pad}" width="${box.size - pad * 2}" height="${box.size - pad * 2}" href="${s.logoDataUrl}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    } else if (s.centerText) {
      const stroke = Math.max(0.4, box.size * 0.06);
      const inset = stroke / 2;
      if (s.enclosure === 'circle') {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${box.size / 2 - inset}" fill="${bg}" stroke="${fg}" stroke-width="${stroke}"/>`);
      } else {
        const sw = s.enclosure === 'square' ? stroke : 0;
        out.push(
          `<rect x="${bx + inset}" y="${by + inset}" width="${box.size - inset * 2}" height="${box.size - inset * 2}" fill="${bg}"${sw ? ` stroke="${fg}" stroke-width="${sw}"` : ''}/>`,
        );
      }
      const chars = Array.from(s.centerText).length;
      const fontSize = (box.size * (s.enclosure === 'none' ? 0.8 : 0.62)) / Math.max(1, chars * 0.75);
      out.push(
        `<text x="${cx}" y="${cy}" fill="${fg}" font-family="${font}, sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${escapeXml(s.centerText)}</text>`,
      );
    }
  }
  out.push('</svg>');
  return { svg: out.join(''), widthUnits, heightUnits };
}

/**
 * Gradient ids are derived from the gradient itself: several SVGs share one document (preview,
 * thumbnails), and a url(#id) resolves to the first element with that id in the whole page.
 */
function gradientId(def: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < def.length; i++) h = Math.imul(h ^ def.charCodeAt(i), 0x01000193);
  return `qr-fg-${(h >>> 0).toString(36)}`;
}

/** Modules and finder patterns, in the chosen shapes and colour (or gradient). */
function codeElements(
  grid: SymbolGrid,
  s: RenderStyle,
  fg: string,
  x0: number,
  y0: number,
  skipOverlay: ((x: number, y: number) => boolean) | undefined,
): string[] {
  const shape = s.moduleShape ?? 'square';
  // Micro QR and rMQR have a single finder pattern; readers need it square (tested with zxing-cpp).
  const single = finderOrigins(grid).length === 1;
  const outer = single ? 'square' : (s.finderOuter ?? 'square');
  const inner = single ? 'square' : (s.finderInner ?? 'square');
  const gradient = s.gradient ?? 'none';
  if (shape === 'square' && outer === 'square' && inner === 'square' && gradient === 'none') {
    return [`<path fill="${fg}" d="${modulesPath(grid, x0, y0, skipOverlay)}"/>`];
  }
  const out: string[] = [];
  let fill = fg;
  if (gradient !== 'none') {
    const fg2 = safeColor(s.fg2 ?? fg, fg);
    const stops = `<stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${fg2}"/>`;
    const [cx, cy] = [x0 + grid.width / 2, y0 + grid.height / 2];
    const attrs =
      gradient === 'linear'
        ? `gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x0 + grid.width}" y2="${y0 + grid.height}"`
        : `gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${Math.round(Math.hypot(grid.width, grid.height) * 500) / 1000}"`;
    const tag = gradient === 'linear' ? 'linearGradient' : 'radialGradient';
    const id = gradientId(tag + attrs + stops);
    out.push(`<defs><${tag} id="${id}" ${attrs}>${stops}</${tag}></defs>`);
    fill = `url(#${id})`;
  }
  const finders = outer === 'square' && inner === 'square' && shape === 'square' ? [] : finderOrigins(grid);
  const inFinder = (x: number, y: number) => finders.some((f) => x >= f.x && x < f.x + 7 && y >= f.y && y < f.y + 7);
  const skip = (x: number, y: number) => inFinder(x, y) || !!skipOverlay?.(x, y);
  const d = shape === 'square' ? modulesPath(grid, x0, y0, skip) : shapedModulesPath(grid, x0, y0, shape, skip);
  out.push(`<path fill="${fill}" d="${d}"/>`);
  if (finders.length) {
    out.push(`<path fill="${fill}" fill-rule="evenodd" d="${finders.map((f) => finderPath(x0 + f.x, y0 + f.y, outer, inner)).join('')}"/>`);
  }
  return out;
}

function roundedRect(w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return `M0 0H${w}V${h}H0z`;
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0z`;
}

/** Fraction of the symbol hidden by the centre overlay. */
export function overlayCoverage(grid: SymbolGrid, ratio: number): number {
  const box = overlayBox(grid, ratio);
  return box ? (box.size * box.size) / (grid.width * grid.height) : 0;
}

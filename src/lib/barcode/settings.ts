import type { RasterFormat } from '../render/raster';
import type { SvgResult } from '../render/svg';
import { mergeKnown } from '../settings';
import { BARCODE_LABELS } from './index';
import type { BarcodeStyle } from './render';
import { DEFAULT_BARCODE_OPTIONS, type BarcodeOptions, type BarcodeType } from './types';

export interface BarcodeOutput {
  unit: 'px' | 'mm';
  /** Narrow bar width in pixels. */
  modulePx: number;
  /** Narrow bar width (X dimension) in millimetres. */
  moduleMm: number;
  dpi: number;
  format: RasterFormat | 'svg';
  quality: number;
}

export interface BarcodeSettings {
  type: BarcodeType;
  options: BarcodeOptions;
  style: BarcodeStyle;
  output: BarcodeOutput;
}

export const BARCODE_KEY = 'qr-studio:barcode';

export const DEFAULT_BARCODE_STYLE: BarcodeStyle = {
  height: 50,
  quietZone: 'auto',
  marginY: 5,
  showText: true,
  textPosition: 'bottom',
  fontSize: 10,
  textGap: 1,
  font: 'jetbrains',
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  bearer: 'none',
};

export const DEFAULT_BARCODE_OUTPUT: BarcodeOutput = {
  unit: 'px',
  modulePx: 2,
  moduleMm: 0.33,
  dpi: 300,
  format: 'png',
  quality: 0.92,
};

export const BARCODE_LIMITS = {
  height: [5, 300],
  quietZone: [0, 40],
  marginY: [0, 40],
  fontSize: [4, 30],
  textGap: [0, 10],
  modulePx: [1, 20],
  moduleMm: [0.1, 2],
  dpi: [72, 1200],
  wideRatio: [2, 3],
} as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const round = (v: number, step: number) => Math.round(v / step) * step;

export function normalizeBarcodeStyle(s: BarcodeStyle): BarcodeStyle {
  const L = BARCODE_LIMITS;
  return {
    height: round(clamp(s.height, L.height), 0.5),
    quietZone: s.quietZone === 'auto' ? 'auto' : Math.round(clamp(s.quietZone, L.quietZone)),
    marginY: round(clamp(s.marginY, L.marginY), 0.5),
    showText: s.showText !== false,
    textPosition: oneOf(s.textPosition, ['bottom', 'top'] as const, 'bottom'),
    fontSize: round(clamp(s.fontSize, L.fontSize), 0.5),
    textGap: round(clamp(s.textGap, L.textGap), 0.5),
    font: oneOf(s.font, ['jetbrains', 'sans', 'serif', 'mono'] as const, 'jetbrains'),
    fg: hex(s.fg, DEFAULT_BARCODE_STYLE.fg),
    bg: hex(s.bg, DEFAULT_BARCODE_STYLE.bg),
    transparent: s.transparent === true,
    bearer: oneOf(s.bearer, ['none', 'bars', 'frame'] as const, 'none'),
  };
}

export function normalizeBarcodeOutput(o: BarcodeOutput): BarcodeOutput {
  const L = BARCODE_LIMITS;
  return {
    unit: o.unit === 'mm' ? 'mm' : 'px',
    modulePx: Math.round(clamp(o.modulePx, L.modulePx)),
    moduleMm: round(clamp(o.moduleMm, L.moduleMm), 0.001),
    dpi: Math.round(clamp(o.dpi, L.dpi)),
    format: oneOf(o.format, ['png', 'svg', 'jpeg', 'webp'] as const, 'png'),
    quality: clamp(o.quality, [0.5, 1]),
  };
}

export function normalizeBarcodeOptions(o: BarcodeOptions): BarcodeOptions {
  const guards = ['A', 'B', 'C', 'D'] as const;
  return {
    checkDigit: o.checkDigit === true,
    fullAscii: o.fullAscii === true,
    wideRatio: Math.round(clamp(o.wideRatio, BARCODE_LIMITS.wideRatio)),
    msiCheck: oneOf(o.msiCheck, ['none', 'mod10', 'mod11', 'mod1010', 'mod1110'] as const, 'mod10'),
    codabarStart: oneOf(o.codabarStart, guards, 'A'),
    codabarStop: oneOf(o.codabarStop, guards, 'A'),
    addon: String(o.addon ?? '').slice(0, 5),
  };
}

export function loadBarcodeSettings(stored: unknown): BarcodeSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  return {
    type: oneOf(s.type, Object.keys(BARCODE_LABELS) as BarcodeType[], 'code128'),
    options: normalizeBarcodeOptions(mergeKnown(DEFAULT_BARCODE_OPTIONS, s.options)),
    style: normalizeBarcodeStyle(mergeKnown(DEFAULT_BARCODE_STYLE, s.style)),
    output: normalizeBarcodeOutput(mergeKnown(DEFAULT_BARCODE_OUTPUT, s.output)),
  };
}

export interface BarcodeSize {
  pxWidth: number;
  pxHeight: number;
  svgAttr: { width: string; height: string };
  /** Pixels (printer dots) per narrow bar in the raster output. */
  dotsPerModule: number;
  /** Narrow bar width actually produced by the raster output (mm mode). */
  rasterModuleMm: number | null;
}

/**
 * Raster output always uses a whole number of pixels per module so every bar keeps its exact
 * width; in mm mode the X dimension is rounded to the printer's dot grid.
 */
export function barcodeSize(r: Pick<SvgResult, 'widthUnits' | 'heightUnits'>, o: BarcodeOutput): BarcodeSize {
  const dots = o.unit === 'px' ? o.modulePx : Math.max(1, Math.round((o.moduleMm * o.dpi) / 25.4));
  const mm = (v: number) => `${Math.round(v * 1000) / 1000}mm`;
  return {
    pxWidth: Math.round(r.widthUnits * dots),
    pxHeight: Math.round(r.heightUnits * dots),
    svgAttr:
      o.unit === 'px'
        ? { width: `${Math.round(r.widthUnits * dots)}`, height: `${Math.round(r.heightUnits * dots)}` }
        : { width: mm(r.widthUnits * o.moduleMm), height: mm(r.heightUnits * o.moduleMm) },
    dotsPerModule: dots,
    rasterModuleMm: o.unit === 'mm' ? (dots * 25.4) / o.dpi : null,
  };
}

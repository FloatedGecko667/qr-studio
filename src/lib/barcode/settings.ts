import type { OutputFormat } from '../render/raster';
import type { SvgResult } from '../render/svg';
import { mergeKnown } from '../settings';
import { AZTEC_LAYOUTS, aztecLayoutId } from './aztec';
import { DM_SIZES, dmSizeLabel } from './datamatrix';
import { BARCODE_LABELS } from './index';
import type { BarcodeStyle } from './render';
import { DEFAULT_BARCODE_OPTIONS, type BarcodeOptions, type BarcodeSymbol, type BarcodeType } from './types';

export interface BarcodeOutput {
  unit: 'px' | 'mm';
  /** Narrow bar width in pixels. */
  modulePx: number;
  /** Narrow bar width (X dimension) in millimetres. */
  moduleMm: number;
  /** Data Matrix module size; 2D symbols need larger modules than bars. */
  matrixModulePx: number;
  matrixModuleMm: number;
  dpi: number;
  format: OutputFormat;
  quality: number;
}

export interface BarcodeSettings {
  type: BarcodeType;
  options: BarcodeOptions;
  style: BarcodeStyle;
  output: BarcodeOutput;
}

export const BARCODE_KEY = 'qr-studio:barcode';
export const MATRIX_KEY = 'qr-studio:datamatrix';

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
  matrixModulePx: 8,
  matrixModuleMm: 0.5,
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
  matrixModulePx: [1, 50],
  moduleMm: [0.1, 2],
  dpi: [72, 1200],
  wideRatio: [2, 3],
  pdfLevel: [0, 8],
  pdfColumns: [1, 30],
  aztecEcc: [5, 90],
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
    matrixModulePx: Math.round(clamp(o.matrixModulePx, L.matrixModulePx)),
    matrixModuleMm: round(clamp(o.matrixModuleMm, L.moduleMm), 0.001),
    dpi: Math.round(clamp(o.dpi, L.dpi)),
    format: oneOf(o.format, ['png', 'svg', 'jpeg', 'webp', 'pdf'] as const, 'png'),
    quality: clamp(o.quality, [0.5, 1]),
  };
}

export function normalizeBarcodeOptions(o: BarcodeOptions): BarcodeOptions {
  const guards = ['A', 'B', 'C', 'D'] as const;
  const L = BARCODE_LIMITS;
  const dmShape = oneOf(o.dmShape, ['auto', 'square', 'rect'] as const, 'square');
  return {
    checkDigit: o.checkDigit === true,
    fullAscii: o.fullAscii === true,
    wideRatio: Math.round(clamp(o.wideRatio, L.wideRatio)),
    msiCheck: oneOf(o.msiCheck, ['none', 'mod10', 'mod11', 'mod1010', 'mod1110'] as const, 'mod10'),
    codabarStart: oneOf(o.codabarStart, guards, 'A'),
    codabarStop: oneOf(o.codabarStop, guards, 'A'),
    addon: String(o.addon ?? '').slice(0, 5),
    dmShape,
    // A fixed size must match the shape, or the size menu could not show it.
    dmSize: DM_SIZES.some((s) => dmSizeLabel(s) === o.dmSize && (dmShape === 'auto' || (dmShape === 'square') === (s.rows === s.cols)))
      ? o.dmSize
      : 'auto',
    pdfLevel: o.pdfLevel === 'auto' ? 'auto' : Math.round(clamp(Number(o.pdfLevel), L.pdfLevel)),
    pdfColumns: o.pdfColumns === 'auto' ? 'auto' : Math.round(clamp(Number(o.pdfColumns), L.pdfColumns)),
    aztecEcc: Math.round(clamp(Number(o.aztecEcc), L.aztecEcc)),
    aztecSize: AZTEC_LAYOUTS.some((l) => aztecLayoutId(l) === o.aztecSize) ? o.aztecSize : 'auto',
  };
}

/**
 * `types` limits the symbologies of one generator (barcodes or Data Matrix); `styleDefaults`
 * overrides the default style for it.
 */
export function loadBarcodeSettings(
  stored: unknown,
  types: readonly BarcodeType[] = Object.keys(BARCODE_LABELS) as BarcodeType[],
  styleDefaults: Partial<BarcodeStyle> = {},
): BarcodeSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  return {
    type: oneOf(s.type, types, types[0]),
    options: normalizeBarcodeOptions(mergeKnown(DEFAULT_BARCODE_OPTIONS, s.options)),
    style: normalizeBarcodeStyle(mergeKnown({ ...DEFAULT_BARCODE_STYLE, ...styleDefaults }, s.style)),
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
/** Module size in px and mm for the symbol kind (stacked and 4-state symbols use the linear X dimension). */
export function moduleSize(o: BarcodeOutput, kind: BarcodeSymbol['kind']): { px: number; mm: number } {
  return kind === 'matrix' ? { px: o.matrixModulePx, mm: o.matrixModuleMm } : { px: o.modulePx, mm: o.moduleMm };
}

export function barcodeSize(r: Pick<SvgResult, 'widthUnits' | 'heightUnits'>, o: BarcodeOutput, kind: BarcodeSymbol['kind'] = 'linear'): BarcodeSize {
  const m = moduleSize(o, kind);
  const dots = o.unit === 'px' ? m.px : Math.max(1, Math.round((m.mm * o.dpi) / 25.4));
  const mm = (v: number) => `${Math.round(v * 1000) / 1000}mm`;
  return {
    pxWidth: Math.round(r.widthUnits * dots),
    pxHeight: Math.round(r.heightUnits * dots),
    svgAttr:
      o.unit === 'px'
        ? { width: `${Math.round(r.widthUnits * dots)}`, height: `${Math.round(r.heightUnits * dots)}` }
        : { width: mm(r.widthUnits * m.mm), height: mm(r.heightUnits * m.mm) },
    dotsPerModule: dots,
    rasterModuleMm: o.unit === 'mm' ? (dots * 25.4) / o.dpi : null,
  };
}

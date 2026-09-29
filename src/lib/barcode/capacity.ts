// Capacity tables for the 2D symbologies. Every number comes from the real encoders (binary
// search on the encoded length), so the table always agrees with what is generated.
import { AZTEC_LAYOUTS, aztecBits, aztecFit, aztecLayoutId, aztecModules, type AztecLayout } from './aztec';
import { DM_SIZES, dmSizeLabel, eciPrefix, encodeTokens, type DmShape, type DmSize, type DmToken } from './datamatrix';
import { PDF417_MAX_COLUMNS, PDF417_MAX_CODEWORDS, PDF417_MAX_ROWS, pdf417Codewords } from './pdf417';

export interface CapacityRow {
  /** Option value that selects this row (size label, layout id or EC level). */
  id: string;
  label: string;
  /** Symbol size in modules. */
  width: number;
  height: number;
  /** Most characters that fit, per kind of content. */
  maxDigits: number;
  maxUpper: number;
  maxBytes: number;
  /** Units (codewords or bits) available for data, and used by the current input (null: no input). */
  available: number;
  used: number | null;
}

export type CapacityUnit = 'cw' | 'bit';

/** Largest n in [0, hi] with fits(n) true; fits must be monotonic. */
function maxFitting(hi: number, fits: (n: number) => boolean): number {
  let lo = 0;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const repeat = (n: number, v: number) => Array.from({ length: n }, () => v);
// Content kinds for the max columns: digits, upper-case letters, and bytes outside ASCII.
const DIGIT = 0x31;
const UPPER = 0x41;
const HIGH = 0xe9;

// --- Data Matrix -------------------------------------------------------------------------------

/**
 * Most digits, upper-case letters and non-ASCII bytes per size, as this encoder packs them.
 * Searching these at run time takes over a second, so they are fixed here; capacity.test.ts
 * checks every value (the maximum fits, one more does not).
 */
const DM_MAX: Record<string, [number, number, number]> = {
  '10x10': [6, 3, 1], '12x12': [10, 5, 3], '8x18': [10, 5, 3], '14x14': [16, 9, 6], '8x32': [20, 12, 8],
  '16x16': [24, 15, 10], '12x26': [32, 21, 14], '18x18': [36, 24, 16], '20x20': [44, 30, 20], '12x36': [44, 30, 20],
  '22x22': [60, 42, 28], '16x36': [64, 45, 30], '24x24': [72, 51, 34], '26x26': [88, 63, 42], '16x48': [98, 70, 47],
  '32x32': [124, 90, 60], '36x36': [172, 126, 84], '40x40': [228, 168, 112], '44x44': [288, 213, 142], '48x48': [348, 258, 172],
  '52x52': [408, 303, 202], '64x64': [560, 417, 277], '72x72': [736, 549, 365], '80x80': [912, 681, 453], '88x88': [1152, 861, 573],
  '96x96': [1392, 1041, 693], '104x104': [1632, 1221, 813], '120x120': [2100, 1572, 1047], '132x132': [2608, 1953, 1301], '144x144': [3116, 2334, 1555],
};
const dmMax = (size: DmSize) => DM_MAX[dmSizeLabel(size)];

/** `used`: data codewords of the current input (with its ECI prefix), or null. */
export function dmCapacityRows(shape: DmShape, used: number | null): CapacityRow[] {
  return DM_SIZES.filter((s) => shape === 'auto' || (shape === 'square') === (s.rows === s.cols)).map((s) => {
    const [maxDigits, maxUpper, maxBytes] = dmMax(s);
    return { id: dmSizeLabel(s), label: `${s.rows} × ${s.cols}`, width: s.cols, height: s.rows, maxDigits, maxUpper, maxBytes, available: s.dataCw, used };
  });
}

/** Data codewords the input needs (independent of the symbol size). */
export function dmUsed(tokens: readonly DmToken[], eci?: number): number {
  return encodeTokens(tokens, eciPrefix(eci), Infinity).length;
}

// --- Aztec -------------------------------------------------------------------------------------

const azCache = new Map<string, [number, number, number]>();
function azMax(layout: AztecLayout, ecc: number): [number, number, number] {
  const key = `${aztecLayoutId(layout)}/${ecc}`;
  let v = azCache.get(key);
  if (!v) {
    const fits = (bytes: number[]) => aztecFit(aztecBits(bytes), layout, ecc).words !== null;
    const hi = Math.floor(aztecFit([], layout, ecc).usableBits / 4);
    v = [maxFitting(hi, (n) => fits(repeat(n, DIGIT))), maxFitting(hi, (n) => fits(repeat(n, UPPER))), maxFitting(hi, (n) => fits(repeat(n, HIGH)))];
    azCache.set(key, v);
  }
  return v;
}

/** `bits`: the current input's message bits (null: no input). Usage is in bits. */
export function aztecCapacityRows(ecc: number, bits: readonly number[] | null): CapacityRow[] {
  return AZTEC_LAYOUTS.map((l) => {
    const [maxDigits, maxUpper, maxBytes] = azMax(l, ecc);
    const fit = aztecFit(bits ?? [], l, ecc);
    const n = aztecModules(l);
    return {
      id: aztecLayoutId(l),
      label: `${l.compact ? 'Compact' : 'Full'} ${l.layers}`,
      width: n,
      height: n,
      maxDigits,
      maxUpper,
      maxBytes,
      available: fit.usableBits,
      used: bits ? fit.needBits : null,
    };
  });
}

// --- PDF417 ------------------------------------------------------------------------------------

/** Data codewords (with the length descriptor) available at an EC level and column setting. */
export function pdfAvailable(level: number, columns: number | 'auto'): number {
  const cells = columns === 'auto' ? PDF417_MAX_COLUMNS * PDF417_MAX_ROWS : columns * PDF417_MAX_ROWS;
  return Math.min(PDF417_MAX_CODEWORDS, cells) - 2 ** (level + 1);
}

const pdfCache = new Map<number, [number, number, number]>();
function pdfMax(available: number): [number, number, number] {
  let v = pdfCache.get(available);
  if (!v) {
    const fits = (bytes: number[]) => pdf417Codewords(bytes).length + 1 <= available;
    v = [
      maxFitting(available * 3, (n) => fits(repeat(n, DIGIT))),
      maxFitting(available * 2, (n) => fits(repeat(n, UPPER))),
      maxFitting(available * 2, (n) => fits(repeat(n, HIGH))),
    ];
    pdfCache.set(available, v);
  }
  return v;
}

/**
 * One row per EC level. `used`: data codewords of the current input with the length descriptor
 * (null: no input); `layout` gives the columns and rows for that level (null if it does not fit).
 */
export function pdfCapacityRows(
  columns: number | 'auto',
  used: number | null,
  layout: (level: number) => { columns: number; rows: number } | null,
): CapacityRow[] {
  return Array.from({ length: 9 }, (_, level) => {
    const available = Math.max(0, pdfAvailable(level, columns));
    const [maxDigits, maxUpper, maxBytes] = pdfMax(available);
    const l = layout(level);
    return {
      id: String(level),
      label: `${level}（${2 ** (level + 1)}）`,
      width: l ? 69 + 17 * l.columns : 0,
      height: l ? l.rows : 0,
      maxDigits,
      maxUpper,
      maxBytes,
      available,
      used,
    };
  });
}

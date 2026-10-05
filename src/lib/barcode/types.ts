export type BarcodeType =
  | 'code128'
  | 'code128a'
  | 'code128b'
  | 'code128c'
  | 'gs1-128'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'itf'
  | 'itf14'
  | 'code39'
  | 'code93'
  | 'codabar'
  | 'msi'
  | 'pharmacode'
  | 'datamatrix'
  | 'gs1-datamatrix'
  | 'pdf417'
  | 'aztec'
  | 'bookjan'
  | 'japanpost';

export type MsiCheck = 'none' | 'mod10' | 'mod11' | 'mod1010' | 'mod1110';
export type CodabarGuard = 'A' | 'B' | 'C' | 'D';
export type DmShape = 'auto' | 'square' | 'rect';

export interface BarcodeOptions {
  /** Optional check character: Code 39 (mod 43) and ITF (mod 10). */
  checkDigit: boolean;
  /** Code 39 Full ASCII (lower case and symbols via shift pairs). */
  fullAscii: boolean;
  /** Wide:narrow element ratio (2 or 3) for Code 39, ITF and Codabar. */
  wideRatio: number;
  msiCheck: MsiCheck;
  codabarStart: CodabarGuard;
  codabarStop: CodabarGuard;
  /** EAN/UPC 2- or 5-digit add-on ('' = none). */
  addon: string;
  /** Data Matrix: allowed shapes when the size is automatic. */
  dmShape: DmShape;
  /** Data Matrix: 'auto' or a fixed size such as "16x16". */
  dmSize: string;
  /** PDF417 error correction level 0-8, or 'auto' (recommended for the data size). */
  pdfLevel: number | 'auto';
  /** PDF417 data columns 1-30, or 'auto'. */
  pdfColumns: number | 'auto';
  /** Aztec minimum error correction in percent of the symbol. */
  aztecEcc: number;
  /** Aztec: 'auto' or a fixed layout such as "compact-2" / "full-10". */
  aztecSize: string;
}

export const DEFAULT_BARCODE_OPTIONS: BarcodeOptions = {
  checkDigit: false,
  fullAscii: false,
  wideRatio: 3,
  msiCheck: 'mod10',
  codabarStart: 'A',
  codabarStop: 'A',
  addon: '',
  dmShape: 'square',
  dmSize: 'auto',
  pdfLevel: 'auto',
  pdfColumns: 'auto',
  aztecEcc: 23,
  aztecSize: 'auto',
};

export type BarKind = 'bar' | 'guard' | 'addon';

export interface Bar {
  /** Left edge in modules. */
  x: number;
  w: number;
  /** Guard bars extend into the text band; add-on bars start below the add-on text. */
  kind: BarKind;
}

export interface TextPart {
  text: string;
  /** Anchor position in modules (may be negative: EAN/UPC digits outside the guards). */
  x: number;
  anchor: 'start' | 'middle' | 'end';
  /** Smaller digits (UPC number system / check digit). */
  small?: boolean;
  /** Add-on digits are printed above the add-on bars. */
  addon?: boolean;
}

export interface LinearSymbol {
  kind: 'linear';
  /** Width of the bar pattern in modules (without quiet zones). */
  width: number;
  bars: Bar[];
  /** 'retail' places digits between the guard bars (EAN/UPC); 'plain' centres `hrt`. */
  layout: 'plain' | 'retail';
  /** Human-readable text for the plain layout (also used as the history summary). */
  hrt: string;
  /** Per-digit placement for the retail layout. */
  parts: TextPart[];
  /** Minimum quiet zones [left, right] in modules. */
  quiet: [number, number];
  /** Strings a reader may return for this symbol (for the scan check); empty = not readable by zxing. */
  expected: string[];
  /** Encoded data length in characters, for the status line. */
  dataLength: number;
}

/** 2D symbol (Data Matrix) as a module grid. */
export interface MatrixSymbol {
  kind: 'matrix';
  width: number;
  height: number;
  /** Row-major, 1 = dark. */
  modules: Uint8Array;
  hrt: string;
  quiet: [number, number];
  expected: string[];
  dataLength: number;
  /** Symbol size, e.g. "16x16". */
  sizeLabel: string;
  /** Option value of this size in the capacity table (size label, layout id or EC level). */
  sizeId: string;
  usedCodewords: number;
  dataCodewords: number;
}

/** Two or more linear symbols printed one above the other (書籍JAN: two EAN-13). */
export interface StackedSymbol {
  kind: 'stacked';
  rows: LinearSymbol[];
  /** Lines printed above the rows (e.g. "ISBN978-4-..." and "C3055 ¥2980E"). */
  captions: string[];
  /** Gap between rows in modules. */
  gap: number;
  hrt: string;
  /** Every row must be read for the scan check to pass. */
  expected: string[];
  dataLength: number;
}

/** 4-state bar: full, ascender (upper half), descender (lower half), tracker (middle). */
export type FourState = 'F' | 'A' | 'D' | 'T';

/** Height-modulated postal barcode (Japan Post customer barcode). Bars are 1 unit wide on a 2-unit pitch. */
export interface FourStateSymbol {
  kind: 'fourstate';
  bars: FourState[];
  hrt: string;
  quiet: [number, number];
  /** Not readable by zxing-cpp: the scan check is not offered. */
  expected: string[];
  dataLength: number;
}

export type BarcodeSymbol = LinearSymbol | MatrixSymbol | StackedSymbol | FourStateSymbol;

export type EncodeResult = { ok: true; symbol: BarcodeSymbol; warnings: string[] } | { ok: false; error: string; params?: Record<string, string | number> };

export class BarcodeError extends Error {
  constructor(
    public key: string,
    public params?: Record<string, string | number>,
  ) {
    super(key);
  }
}

/** Converts alternating bar/space widths (starting with a bar) into bar rectangles. */
export function widthsToBars(widths: readonly number[], x0 = 0, kind: BarKind = 'bar'): { bars: Bar[]; end: number } {
  const bars: Bar[] = [];
  let x = x0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w, kind });
    x += w;
  });
  return { bars, end: x };
}

/** Expands a width-digit string like "212222" into numbers. */
export function digitsOf(pattern: string): number[] {
  return Array.from(pattern, Number);
}

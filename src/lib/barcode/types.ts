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
  | 'aztec';

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
  usedCodewords: number;
  dataCodewords: number;
}

export type BarcodeSymbol = LinearSymbol | MatrixSymbol;

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

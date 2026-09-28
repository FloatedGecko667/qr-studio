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
  | 'pharmacode';

export type MsiCheck = 'none' | 'mod10' | 'mod11' | 'mod1010' | 'mod1110';
export type CodabarGuard = 'A' | 'B' | 'C' | 'D';

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
}

export const DEFAULT_BARCODE_OPTIONS: BarcodeOptions = {
  checkDigit: false,
  fullAscii: false,
  wideRatio: 3,
  msiCheck: 'mod10',
  codabarStart: 'A',
  codabarStop: 'A',
  addon: '',
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

export type EncodeResult = { ok: true; symbol: LinearSymbol; warnings: string[] } | { ok: false; error: string; params?: Record<string, string | number> };

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

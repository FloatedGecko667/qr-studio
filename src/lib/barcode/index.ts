import { buildGs1 } from '../payload';
import { codabar } from './codabar';
import { code128Widths, textTokens, type Token } from './code128';
import { code39, decodeFullAscii } from './code39';
import { code93 } from './code93';
import { aztecLayoutId, aztecSizeLabel, encodeAztec } from './aztec';
import { dmSizeLabel, encodeDataMatrix, type DmToken } from './datamatrix';
import { ean13, ean8, upca, upce } from './ean';
import { itf, itf14, itfWidths } from './itf';
import { msiData, msiWidths, pharmacodeWidths } from './msi';
import { encodePdf417 } from './pdf417';
import { digitsOnly } from './checksum';
import {
  BarcodeError,
  widthsToBars,
  type BarcodeOptions,
  type BarcodeSymbol,
  type BarcodeType,
  type EncodeResult,
  type LinearSymbol,
  type MatrixSymbol,
} from './types';

export * from './types';

export const BARCODE_GROUPS: { id: string; types: BarcodeType[] }[] = [
  { id: 'retail', types: ['ean13', 'ean8', 'upca', 'upce'] },
  { id: 'industrial', types: ['code128', 'gs1-128', 'code39', 'code93', 'itf', 'itf14', 'codabar'] },
  { id: '2d', types: ['datamatrix', 'gs1-datamatrix', 'pdf417', 'aztec'] },
  { id: 'special', types: ['code128a', 'code128b', 'code128c', 'msi', 'pharmacode'] },
];

export const BARCODE_LABELS: Record<BarcodeType, string> = {
  code128: 'Code 128',
  code128a: 'Code 128 A',
  code128b: 'Code 128 B',
  code128c: 'Code 128 C',
  'gs1-128': 'GS1-128',
  ean13: 'EAN-13 / JAN-13',
  ean8: 'EAN-8 / JAN-8',
  upca: 'UPC-A',
  upce: 'UPC-E',
  itf: 'ITF (Interleaved 2 of 5)',
  itf14: 'ITF-14',
  code39: 'Code 39',
  code93: 'Code 93',
  codabar: 'NW-7 (Codabar)',
  msi: 'MSI',
  pharmacode: 'Pharmacode',
  datamatrix: 'Data Matrix',
  'gs1-datamatrix': 'GS1 DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec Code',
};

export const SAMPLE_VALUES: Record<BarcodeType, string> = {
  code128: 'QR-Studio 2026',
  code128a: 'ABC-123',
  code128b: 'Barcode-123',
  code128c: '12345678',
  'gs1-128': '(01)04912345678904(17)261231(10)ABC123',
  ean13: '490123456789',
  ean8: '4901234',
  upca: '03600029145',
  upce: '0123456',
  itf: '12345678',
  itf14: '1490123456789',
  code39: 'CODE-39',
  code93: 'Code93',
  codabar: 'A123456A',
  msi: '1234567',
  pharmacode: '1234',
  datamatrix: 'QR Studio · Data Matrix 2026',
  'gs1-datamatrix': '(01)04912345678904(17)261231(10)ABC123',
  pdf417: 'QR Studio · PDF417 2026',
  aztec: 'QR Studio · Aztec Code 2026',
};

/** 2D symbologies rendered as a module grid. */
export const IS_MATRIX: ReadonlySet<BarcodeType> = new Set(['datamatrix', 'gs1-datamatrix', 'pdf417', 'aztec']);
/** PDF417 rows are drawn this many modules tall (ISO/IEC 15438 recommends at least 3). */
export const PDF417_ROW_HEIGHT = 3;

/** Longest value accepted in the input field. */
export const maxValueLength = (type: BarcodeType) => (IS_MATRIX.has(type) ? 3000 : 200);

/** Types that take an EAN/UPC add-on. */
export const HAS_ADDON: ReadonlySet<BarcodeType> = new Set(['ean13', 'ean8', 'upca', 'upce']);
/** Types whose wide:narrow ratio is adjustable. */
export const HAS_RATIO: ReadonlySet<BarcodeType> = new Set(['code39', 'itf', 'itf14', 'codabar']);

function plain(widths: number[], hrt: string, expected: string[], quiet: [number, number] = [10, 10]): LinearSymbol {
  const { bars, end } = widthsToBars(widths);
  return { kind: 'linear', width: end, bars, layout: 'plain', hrt, parts: [], quiet, expected, dataLength: hrt.length };
}

/** Printable form of Code 128 text (control characters shown as spaces). */
// oxlint-disable-next-line no-control-regex -- control characters are replaced on purpose
const printable = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ');

function encodeCode128(type: BarcodeType, value: string): LinearSymbol {
  const only = type === 'code128a' ? 'A' : type === 'code128b' ? 'B' : type === 'code128c' ? 'C' : undefined;
  if (only === 'C' && !/^(\d\d)+$/.test(value)) throw new BarcodeError('barcode.error.code128c');
  const tokens = textTokens(value);
  if (only === 'A' && tokens.some((c) => typeof c === 'number' && c >= 96)) throw new BarcodeError('barcode.error.code128a');
  if (only === 'B' && tokens.some((c) => typeof c === 'number' && c < 32)) throw new BarcodeError('barcode.error.code128b');
  return plain(code128Widths(tokens, only).widths, printable(value), [value]);
}

function encodeGs1(value: string): { symbol: LinearSymbol; warnings: string[] } {
  const p = buildGs1({ value });
  if (p.errors.length) throw new BarcodeError(p.errors[0]);
  const tokens: Token[] = ['FNC1'];
  for (const ch of p.text!) tokens.push(ch === '\x1d' ? 'FNC1' : ch.charCodeAt(0));
  const hrt = value.replace(/\s+/g, '');
  const { widths } = code128Widths(tokens);
  // zxing returns GS1 data in the bracketed HRI form.
  return { symbol: plain(widths, hrt, [hrt, p.text!]), warnings: p.warnings };
}

function matrix(tokens: DmToken[], o: BarcodeOptions, hrt: string, expected: string[], eci?: number): MatrixSymbol {
  const r = encodeDataMatrix(tokens, { shape: o.dmShape, size: o.dmSize, eci });
  return {
    kind: 'matrix',
    width: r.size.cols,
    height: r.size.rows,
    modules: r.modules,
    hrt,
    quiet: [2, 2],
    expected,
    dataLength: Array.from(hrt).length,
    sizeLabel: dmSizeLabel(r.size),
    sizeId: dmSizeLabel(r.size),
    usedCodewords: r.used,
    dataCodewords: r.size.dataCw,
  };
}

/**
 * ASCII needs no ECI. Other Latin-1 text is marked with ECI 3 so readers do not guess the
 * character set; anything else is UTF-8 with ECI 26.
 */
function encodeDm(value: string, o: BarcodeOptions): MatrixSymbol {
  const { bytes, eci } = textBytes(value);
  return matrix(bytes, o, printable(value), [value], eci);
}

/** Bytes and ECI as for Data Matrix: ASCII plain, Latin-1 with ECI 3, anything else UTF-8 with ECI 26. */
function textBytes(value: string): { bytes: number[]; eci?: number } {
  const codes = Array.from(value, (ch) => ch.codePointAt(0)!);
  if (codes.every((c) => c < 0x80)) return { bytes: codes };
  if (codes.every((c) => c <= 0xff)) return { bytes: codes, eci: 3 };
  return { bytes: Array.from(new TextEncoder().encode(value)), eci: 26 };
}

function encodePdf(value: string, o: BarcodeOptions): MatrixSymbol {
  const { bytes, eci } = textBytes(value);
  const r = encodePdf417(bytes, { level: o.pdfLevel, columns: o.pdfColumns, eci });
  // Each codeword row is drawn PDF417_ROW_HEIGHT modules tall.
  const height = r.rows * PDF417_ROW_HEIGHT;
  const modules = new Uint8Array(r.width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / PDF417_ROW_HEIGHT);
    modules.set(r.modules.subarray(row * r.width, (row + 1) * r.width), y * r.width);
  }
  return {
    kind: 'matrix',
    width: r.width,
    height,
    modules,
    hrt: printable(value),
    quiet: [2, 2],
    expected: [value],
    dataLength: Array.from(value).length,
    sizeLabel: `${r.columns} × ${r.rows} · EC${r.level}`,
    sizeId: String(r.level),
    usedCodewords: r.used,
    dataCodewords: r.capacity,
  };
}

function encodeAz(value: string, o: BarcodeOptions): MatrixSymbol {
  const { bytes, eci } = textBytes(value);
  const r = encodeAztec(bytes, { eccPercent: o.aztecEcc, eci, size: o.aztecSize });
  return {
    kind: 'matrix',
    width: r.size,
    height: r.size,
    modules: r.modules,
    hrt: printable(value),
    // The bullseye finder needs no quiet zone; a small margin still helps phone cameras.
    quiet: [1, 1],
    expected: [value],
    dataLength: Array.from(value).length,
    sizeLabel: aztecSizeLabel(r),
    sizeId: aztecLayoutId(r),
    usedCodewords: r.dataWords,
    dataCodewords: r.capacityWords,
  };
}

/** GS1 element string as Data Matrix tokens: FNC1 first and as the field separator. */
function gs1DmTokens(value: string): { tokens: DmToken[]; text: string; warnings: string[] } {
  const p = buildGs1({ value });
  if (p.errors.length) throw new BarcodeError(p.errors[0]);
  const tokens: DmToken[] = ['FNC1'];
  for (const ch of p.text!) tokens.push(ch === '\x1d' ? 'FNC1' : ch.charCodeAt(0));
  return { tokens, text: p.text!, warnings: p.warnings };
}

function encodeGs1Dm(value: string, o: BarcodeOptions): { symbol: MatrixSymbol; warnings: string[] } {
  const { tokens, text, warnings } = gs1DmTokens(value);
  const hrt = value.replace(/\s+/g, '');
  return { symbol: matrix(tokens, o, hrt, [hrt, text]), warnings };
}

/** The data a 2D encoder receives for `value` (for the capacity table), or null if invalid. */
export function matrixInput(type: BarcodeType, value: string): { tokens: DmToken[]; eci?: number } | null {
  if (value === '' || !IS_MATRIX.has(type)) return null;
  try {
    if (type === 'gs1-datamatrix') return { tokens: gs1DmTokens(value).tokens };
    const { bytes, eci } = textBytes(value);
    return { tokens: bytes, eci };
  } catch {
    return null;
  }
}

function encodeSymbol(type: BarcodeType, value: string, o: BarcodeOptions): { symbol: BarcodeSymbol; warnings: string[] } {
  switch (type) {
    case 'code128':
    case 'code128a':
    case 'code128b':
    case 'code128c':
      return { symbol: encodeCode128(type, value), warnings: [] };
    case 'gs1-128':
      return encodeGs1(value);
    case 'ean13':
      return { symbol: ean13(value, o.addon), warnings: [] };
    case 'ean8':
      return { symbol: ean8(value, o.addon), warnings: [] };
    case 'upca':
      return { symbol: upca(value, o.addon), warnings: [] };
    case 'upce':
      return { symbol: upce(value, o.addon), warnings: [] };
    case 'itf': {
      const d = itf(value, o.checkDigit);
      return { symbol: plain(itfWidths(d, o.wideRatio), d, [d]), warnings: [] };
    }
    case 'itf14': {
      const d = itf14(value);
      return { symbol: plain(itfWidths(d, o.wideRatio), d, [d]), warnings: [] };
    }
    case 'code39': {
      const { data, widths } = code39(value, o);
      const shown = o.fullAscii ? value : data;
      // Readers return the payload with or without the check character, and scanners in
      // Full ASCII mode merge shift pairs such as "+A" into one character.
      const check = o.checkDigit ? data.at(-1)! : '';
      const expected = [value, value + check, data, decodeFullAscii(data)];
      const ambiguous = !o.fullAscii && /[$%/+][A-Z]/.test(value);
      return { symbol: plain(widths, `*${printable(shown)}*`, expected), warnings: ambiguous ? ['barcode.warn.code39Shift'] : [] };
    }
    case 'code93':
      return { symbol: plain(code93(value), printable(value), [value]), warnings: [] };
    case 'codabar': {
      const { data, widths } = codabar(value, { start: o.codabarStart, stop: o.codabarStop, wideRatio: o.wideRatio });
      return { symbol: plain(widths, data, [data, data.slice(1, -1)]), warnings: [] };
    }
    case 'msi': {
      const data = msiData(value, o.msiCheck);
      return { symbol: plain(msiWidths(data), data, [], [12, 12]), warnings: [] };
    }
    case 'datamatrix':
      return { symbol: encodeDm(value, o), warnings: [] };
    case 'gs1-datamatrix':
      return encodeGs1Dm(value, o);
    case 'pdf417':
      return { symbol: encodePdf(value, o), warnings: [] };
    case 'aztec':
      return { symbol: encodeAz(value, o), warnings: [] };
    case 'pharmacode': {
      const widths = pharmacodeWidths(value);
      return { symbol: plain(widths, String(Number(digitsOnly(value))), [], [6, 6]), warnings: [] };
    }
  }
}

export function encodeBarcode(type: BarcodeType, value: string, options: BarcodeOptions): EncodeResult {
  // Data Matrix can carry whitespace-only data; linear symbologies cannot sensibly.
  if (IS_MATRIX.has(type) ? value === '' : value.trim() === '') return { ok: false, error: 'barcode.error.empty' };
  try {
    const { symbol, warnings } = encodeSymbol(type, value, options);
    return { ok: true, symbol, warnings };
  } catch (e) {
    if (e instanceof BarcodeError) return { ok: false, error: e.key, params: e.params };
    throw e;
  }
}

import { buildGs1 } from '../payload';
import { codabar } from './codabar';
import { code128Widths, textTokens, type Token } from './code128';
import { code39, decodeFullAscii } from './code39';
import { code93 } from './code93';
import { ean13, ean8, upca, upce } from './ean';
import { itf, itf14, itfWidths } from './itf';
import { msiData, msiWidths, pharmacodeWidths } from './msi';
import { digitsOnly } from './checksum';
import { BarcodeError, widthsToBars, type BarcodeOptions, type BarcodeType, type EncodeResult, type LinearSymbol } from './types';

export * from './types';

export const BARCODE_GROUPS: { id: string; types: BarcodeType[] }[] = [
  { id: 'retail', types: ['ean13', 'ean8', 'upca', 'upce'] },
  { id: 'industrial', types: ['code128', 'gs1-128', 'code39', 'code93', 'itf', 'itf14', 'codabar'] },
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
};

/** Types that take an EAN/UPC add-on. */
export const HAS_ADDON: ReadonlySet<BarcodeType> = new Set(['ean13', 'ean8', 'upca', 'upce']);
/** Types whose wide:narrow ratio is adjustable. */
export const HAS_RATIO: ReadonlySet<BarcodeType> = new Set(['code39', 'itf', 'itf14', 'codabar']);

function plain(widths: number[], hrt: string, expected: string[], quiet: [number, number] = [10, 10]): LinearSymbol {
  const { bars, end } = widthsToBars(widths);
  return { width: end, bars, layout: 'plain', hrt, parts: [], quiet, expected, dataLength: hrt.length };
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

function encodeSymbol(type: BarcodeType, value: string, o: BarcodeOptions): { symbol: LinearSymbol; warnings: string[] } {
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
    case 'pharmacode': {
      const widths = pharmacodeWidths(value);
      return { symbol: plain(widths, String(Number(digitsOnly(value))), [], [6, 6]), warnings: [] };
    }
  }
}

export function encodeBarcode(type: BarcodeType, value: string, options: BarcodeOptions): EncodeResult {
  if (value.trim() === '') return { ok: false, error: 'barcode.error.empty' };
  try {
    const { symbol, warnings } = encodeSymbol(type, value, options);
    return { ok: true, symbol, warnings };
  } catch (e) {
    if (e instanceof BarcodeError) return { ok: false, error: e.key, params: e.params };
    throw e;
  }
}

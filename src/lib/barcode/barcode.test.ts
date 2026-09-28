import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeLinear } from '../../test/decode';
import { code128Codewords, textTokens } from './code128';
import { upcaToUpce, upceToUpca } from './ean';
import { DEFAULT_BARCODE_OPTIONS, encodeBarcode, type BarcodeOptions, type BarcodeType, type LinearSymbol } from './index';

// bwip-js (dev dependency) is the reference encoder.
const bwip = createRequire(import.meta.url)('bwip-js') as { raw: (o: Record<string, unknown>) => { sbs: number[] }[] };

function encode(type: BarcodeType, value: string, opts: Partial<BarcodeOptions> = {}): LinearSymbol {
  const r = encodeBarcode(type, value, { ...DEFAULT_BARCODE_OPTIONS, ...opts });
  if (!r.ok) throw new Error(`${type} ${value}: ${r.error}`);
  return r.symbol;
}

/** Bar/space widths from the bar rectangles. */
function widthsOf(sym: LinearSymbol, onlyMain = false): number[] {
  const bars = onlyMain ? sym.bars.filter((b) => b.kind !== 'addon') : sym.bars;
  const out: number[] = [];
  bars.forEach((b, i) => {
    if (i > 0) out.push(b.x - (bars[i - 1].x + bars[i - 1].w));
    out.push(b.w);
  });
  return out;
}

function reference(o: Record<string, unknown>): number[] {
  const sbs = [...bwip.raw(o)[0].sbs];
  while (sbs.length % 2 === 0) sbs.pop(); // drop trailing space
  return sbs;
}

const CASES: [BarcodeType, string, Partial<BarcodeOptions>, Record<string, unknown>][] = [
  ['code128b', 'Hello, World!', {}, { bcid: 'code128', text: 'Hello, World!' }],
  ['code128c', '1234567890', {}, { bcid: 'code128', text: '1234567890' }],
  ['ean13', '490123456789', {}, { bcid: 'ean13', text: '4901234567894' }],
  ['ean13', '9784873119038', {}, { bcid: 'ean13', text: '9784873119038' }],
  ['ean8', '4901234', {}, { bcid: 'ean8', text: '49012347' }],
  ['upca', '03600029145', {}, { bcid: 'upca', text: '036000291452' }],
  ['upce', '0123456', {}, { bcid: 'upce', text: '0123456' }],
  ['upce', '1654321', {}, { bcid: 'upce', text: '1654321' }],
  ['itf', '12345678', { wideRatio: 2 }, { bcid: 'interleaved2of5', text: '12345678' }],
  ['itf', '1234567', { wideRatio: 2, checkDigit: true }, { bcid: 'interleaved2of5', text: '1234567', includecheck: true }],
  ['itf14', '1490123456789', { wideRatio: 2 }, { bcid: 'interleaved2of5', text: '14901234567891' }],
  ['code39', 'CODE-39 $/+%', {}, { bcid: 'code39', text: 'CODE-39 $/+%' }],
  ['code39', 'ABC123', { checkDigit: true }, { bcid: 'code39', text: 'ABC123', includecheck: true }],
  ['code39', 'Full ascii!', { fullAscii: true }, { bcid: 'code39ext', text: 'Full ascii!' }],
  ['code93', 'CODE93', {}, { bcid: 'code93', text: 'CODE93', includecheck: true }],
  ['code93', 'Mixed case & symbols!', {}, { bcid: 'code93ext', text: 'Mixed case & symbols!', includecheck: true }],
  ['codabar', 'A40156B', {}, { bcid: 'rationalizedCodabar', text: 'A40156B' }],
  ['codabar', '-$:/.+0123', { codabarStart: 'C', codabarStop: 'D' }, { bcid: 'rationalizedCodabar', text: 'C-$:/.+0123D' }],
  ['msi', '1234567', { msiCheck: 'none' }, { bcid: 'msi', text: '1234567' }],
  ['msi', '1234567', { msiCheck: 'mod10' }, { bcid: 'msi', text: '1234567', includecheck: true, checktype: 'mod10' }],
  ['msi', '1234567', { msiCheck: 'mod1010' }, { bcid: 'msi', text: '1234567', includecheck: true, checktype: 'mod1010' }],
  ['msi', '1234567', { msiCheck: 'mod11' }, { bcid: 'msi', text: '1234567', includecheck: true, checktype: 'mod11' }],
  ['msi', '1234567', { msiCheck: 'mod1110' }, { bcid: 'msi', text: '1234567', includecheck: true, checktype: 'mod1110' }],
  ['pharmacode', '3', {}, { bcid: 'pharmacode', text: '3' }],
  ['pharmacode', '131070', {}, { bcid: 'pharmacode', text: '131070' }],
  ['pharmacode', '1234', {}, { bcid: 'pharmacode', text: '1234' }],
];

describe('bar patterns match bwip-js', () => {
  for (const [type, value, opts, ref] of CASES) {
    it(`${type} ${value}`, () => {
      expect(widthsOf(encode(type, value, opts))).toEqual(reference(ref));
    });
  }

  it('EAN-2 / EAN-5 add-ons', () => {
    for (const addon of ['12', '86104', '52495']) {
      const ours = encode('ean13', '4901234567894', { addon }).bars.filter((b) => b.kind === 'addon');
      const ref = reference({ bcid: addon.length === 2 ? 'ean2' : 'ean5', text: addon });
      const x0 = ours[0].x;
      const widths: number[] = [];
      ours.forEach((b, i) => {
        if (i > 0) widths.push(b.x - (ours[i - 1].x + ours[i - 1].w));
        widths.push(b.w);
      });
      expect(widths, addon).toEqual(ref);
      expect(x0).toBe(95 + 9);
    }
  });
});

describe('Code 128 optimisation', () => {
  it('uses no more codewords than bwip-js', () => {
    for (const text of ['ABC123456789', 'a1b2c3', '12345abc67890', 'X\tY', '\x01lower\x02', '0', '00a', 'AB\x03cd']) {
      const ours = code128Codewords(textTokens(text)).cws.length + 3;
      const sbs = bwip.raw({ bcid: 'code128', text })[0].sbs;
      expect(ours, JSON.stringify(text)).toBeLessThanOrEqual((sbs.length - 1) / 6);
    }
  });

  it('prefers code set C for digit runs', () => {
    expect(code128Codewords(textTokens('12345678')).start).toBe('C');
    expect(code128Codewords(textTokens('1234567')).cws.length).toBe(5);
  });
});

describe('round trip through zxing-cpp', () => {
  const readable: [BarcodeType, string, Partial<BarcodeOptions>, string][] = [
    ['code128', 'QR Studio 2026 / 12345678', {}, 'QR Studio 2026 / 12345678'],
    ['code128a', 'ABC\x09123', {}, 'ABC\t123'],
    ['code128b', 'abc-XYZ', {}, 'abc-XYZ'],
    ['code128c', '00112233', {}, '00112233'],
    ['gs1-128', '(01)04912345678904(17)261231(10)ABC123', {}, '(01)04912345678904(17)261231(10)ABC123'],
    ['ean13', '4901234567894', {}, '4901234567894'],
    ['ean8', '4901234', {}, '49012347'],
    ['upca', '036000291452', {}, '0036000291452'],
    ['upce', '01234565', {}, '0012345000065'],
    ['itf', '1234567', { checkDigit: true }, '12345670'],
    ['itf14', '1490123456789', {}, '14901234567891'],
    ['code39', 'CODE-39', {}, 'CODE-39'],
    ['code39', 'lower+case', { fullAscii: true }, 'lower+case'],
    ['code93', 'Code 93!', {}, 'Code 93!'],
    ['codabar', '123456', {}, 'A123456A'],
  ];
  for (const [type, value, opts, want] of readable) {
    it(`${type} ${JSON.stringify(value)}`, async () => {
      const sym = encode(type, value, opts);
      const [r] = await decodeLinear(sym);
      expect(r?.text).toBe(want);
      expect(sym.expected).toContain(r?.text);
    });
  }
});

describe('validation', () => {
  const err = (type: BarcodeType, value: string, opts: Partial<BarcodeOptions> = {}) => {
    const r = encodeBarcode(type, value, { ...DEFAULT_BARCODE_OPTIONS, ...opts });
    return r.ok ? null : { error: r.error, params: r.params };
  };

  it('checks check digits and lengths', () => {
    expect(err('ean13', '4901234567890')).toEqual({ error: 'barcode.error.checkDigit', params: { expected: 4 } });
    expect(err('ean13', '49012345')?.error).toBe('barcode.error.length');
    expect(err('ean13', '978-4-87311-903-8')).toBeNull();
    expect(err('itf14', '14901234567894')?.error).toBe('barcode.error.checkDigit');
    expect(err('upce', '01234560')?.error).toBe('barcode.error.checkDigit');
    expect(err('upce', '2123456')?.error).toBe('barcode.error.upceSystem');
  });

  it('rejects characters outside the symbology', () => {
    expect(err('code39', 'abc')).toEqual({ error: 'barcode.error.charAt', params: { char: 'a' } });
    expect(err('code128', 'テスト')?.error).toBe('barcode.error.charAt');
    expect(err('code128c', '123')?.error).toBe('barcode.error.code128c');
    expect(err('code128a', 'abc')?.error).toBe('barcode.error.code128a');
    expect(err('codabar', 'A123')?.error).toBe('barcode.error.codabarGuards');
    expect(err('itf', '123')?.error).toBe('barcode.error.itfOdd');
    expect(err('pharmacode', '2')?.error).toBe('barcode.error.range');
    expect(err('ean13', '490123456789', { addon: '123' })?.error).toBe('barcode.error.addon');
    expect(err('gs1-128', '0104912345678904')?.error).toBe('payload.gs1.syntax');
    expect(err('code128', '   ')?.error).toBe('barcode.error.empty');
  });

  it('warns about a wrong GTIN check digit in GS1-128', () => {
    const r = encodeBarcode('gs1-128', '(01)04912345678900', DEFAULT_BARCODE_OPTIONS);
    expect(r.ok && r.warnings).toEqual(['payload.gs1.checkDigit']);
  });
});

describe('review fixes', () => {
  it('labels Pharmacode from normalized digits', () => {
    expect(encode('pharmacode', '１２３４').hrt).toBe('1234');
  });

  it('accepts what Full ASCII readers return for Code 39', async () => {
    const withCheck = encode('code39', 'ab', { fullAscii: true, checkDigit: true });
    const [r] = await decodeLinear(withCheck);
    expect(withCheck.expected).toContain(r?.text);
    const r2 = encodeBarcode('code39', 'A+B', DEFAULT_BARCODE_OPTIONS);
    expect(r2.ok && r2.warnings).toEqual(['barcode.warn.code39Shift']);
    expect(r2.ok && r2.symbol.expected).toContain('Ab');
  });

  it('only aliases Codabar guards at the ends', () => {
    expect(encodeBarcode('codabar', 'T123N', DEFAULT_BARCODE_OPTIONS).ok).toBe(true);
    expect(encodeBarcode('codabar', 'A1E2A', DEFAULT_BARCODE_OPTIONS)).toMatchObject({ error: 'barcode.error.charAt', params: { char: 'E' } });
  });
});

describe('UPC-E zero suppression', () => {
  it('round-trips between UPC-A and UPC-E', () => {
    for (const d of ['123450', '123451', '123452', '123453', '123454', '123455', '123459']) {
      const a = upceToUpca('0', d);
      expect(upcaToUpce(a), a).toBe(d);
    }
    expect(upcaToUpce('01234567890')).toBeNull();
    expect(encode('upce', '042100005264').expected[0]).toBe('04252614');
  });
});

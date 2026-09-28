import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../../test/decode';
import { buildMatrix, DM_SIZES, dmSizeLabel, encodeDataMatrix, encodeTokens, pad, withEcc, type DmToken } from './datamatrix';

const bwip = createRequire(import.meta.url)('bwip-js') as {
  raw: (o: Record<string, unknown>) => { pixs: number[]; pixx: number; pixy: number }[];
};

const bytes = (s: string): DmToken[] => Array.from(new TextEncoder().encode(s));

async function decode(tokens: DmToken[], opts: Parameters<typeof encodeDataMatrix>[1]) {
  const r = encodeDataMatrix(tokens, opts);
  const [res] = await decodeSymbol({ width: r.size.cols, height: r.size.rows, modules: r.modules }, 4, 2, ['DataMatrix']);
  return { r, res };
}

describe('Data Matrix symbol construction matches bwip-js', () => {
  // Same data codewords in every size: placement, finder patterns, padding and RS must agree.
  for (const size of DM_SIZES) {
    it(dmSizeLabel(size), () => {
      const data = encodeTokens(bytes('QR Studio 0123456789 test'.repeat(3)).slice(0, Math.max(1, size.dataCw - 2)));
      const cws = data.slice(0, size.dataCw);
      const r = encodeDataMatrixRaw(cws, dmSizeLabel(size));
      const ref = bwip.raw({ bcid: 'datamatrix', text: cws.map((c) => `^${String(c).padStart(3, '0')}`).join(''), raw: true, version: dmSizeLabel(size) })[0];
      expect([ref.pixx, ref.pixy]).toEqual([size.cols, size.rows]);
      expect(Array.from(r)).toEqual(ref.pixs);
    });
  }
});

function encodeDataMatrixRaw(cws: number[], label: string): Uint8Array {
  const size = DM_SIZES.find((s) => dmSizeLabel(s) === label)!;
  return buildMatrix(withEcc(pad(cws, size.dataCw), size), size);
}

describe('Data Matrix round trip through zxing-cpp', () => {
  const cases: [string, DmToken[], number | undefined][] = [
    ['digits (ASCII pairs)', bytes('01234567890123456789'), undefined],
    ['upper case (C40)', bytes('HELLO WORLD DATA MATRIX CODE 2026'), undefined],
    ['lower case (Text)', bytes('hello world data matrix code'), undefined],
    ['mixed', bytes('QR Studio: https://example.com/?q=1&x=ABC'), undefined],
    ['binary (Base256)', Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff), undefined],
    ['control characters', bytes('A\tB\r\nC\x00D'), undefined],
  ];
  for (const [name, tokens, eci] of cases) {
    it(name, async () => {
      const { res } = await decode(tokens, { shape: 'auto', size: 'auto', eci });
      expect(Array.from(res!.bytes)).toEqual(tokens);
    });
  }

  it('UTF-8 with ECI 26', async () => {
    const text = '日本語のデータマトリックス';
    const { res } = await decode(bytes(text), { shape: 'auto', size: 'auto', eci: 26 });
    expect(res!.text).toBe(text);
  });

  it('GS1 with FNC1', async () => {
    const tokens: DmToken[] = ['FNC1', ...bytes('0104912345678904'), ...bytes('10ABC123'), 'FNC1', ...bytes('17261231')];
    const { res } = await decode(tokens, { shape: 'auto', size: 'auto' });
    expect(res!.text).toBe('(01)04912345678904(10)ABC123(17)261231');
  });

  it('every size decodes when filled', async () => {
    for (const size of DM_SIZES) {
      const tokens = bytes('Data Matrix ECC200 abcdefghijklmnopqrstuvwxyz 0123456789 '.repeat(40)).slice(0, size.dataCw - 1);
      const { r, res } = await decode(tokens, { shape: 'auto', size: dmSizeLabel(size) });
      expect(r.size).toBe(size);
      expect(Array.from(res?.bytes ?? []), dmSizeLabel(size)).toEqual(tokens);
    }
  });
});

describe('Data Matrix size selection', () => {
  it('picks the smallest symbol for the shape', () => {
    // Digit pairs take one codeword each.
    expect(dmSizeLabel(encodeDataMatrix(bytes('123456'), { shape: 'square', size: 'auto' }).size)).toBe('10x10');
    expect(dmSizeLabel(encodeDataMatrix(bytes('12345678'), { shape: 'square', size: 'auto' }).size)).toBe('12x12');
    expect(dmSizeLabel(encodeDataMatrix(bytes('ABCDE'), { shape: 'rect', size: 'auto' }).size)).toBe('8x18');
    expect(dmSizeLabel(encodeDataMatrix(bytes('ABCDE'), { shape: 'auto', size: 'auto' }).size)).toBe('12x12');
  });

  it('rejects oversized input quickly', () => {
    const start = performance.now();
    expect(() => encodeDataMatrix(bytes('日'.repeat(3000)), { shape: 'auto', size: 'auto' })).toThrow('barcode.error.dmTooLong');
    expect(() => encodeDataMatrix(bytes('é'.repeat(1500)), { shape: 'auto', size: 'auto' })).toThrow('barcode.error.dmTooLong');
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('reports data that does not fit', () => {
    expect(() => encodeDataMatrix(bytes('x'.repeat(50)), { shape: 'auto', size: '10x10' })).toThrow('barcode.error.dmTooLong');
    expect(() => encodeDataMatrix(bytes('x'.repeat(4000)), { shape: 'auto', size: 'auto' })).toThrow('barcode.error.dmTooLong');
  });

  it('uses fewer codewords than bwip-js for typical data', () => {
    for (const text of ['HELLO WORLD 123', 'hello world', '0123456789012', 'Mixed Case 42!', 'https://example.com/a?b=c']) {
      const ours = encodeTokens(bytes(text)).length;
      const ref = bwip.raw({ bcid: 'datamatrix', text })[0];
      const refSize = DM_SIZES.find((s) => s.rows === ref.pixy && s.cols === ref.pixx)!;
      expect(ours, text).toBeLessThanOrEqual(refSize.dataCw);
    }
  });
});

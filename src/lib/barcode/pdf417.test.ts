import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../../test/decode';
import { buildPdf417, encodePdf417, layoutPdf417, pdf417Codewords, recommendedLevel } from './pdf417';

const bwip = createRequire(import.meta.url)('bwip-js') as {
  raw: (o: Record<string, unknown>) => { pixs: number[]; pixx: number }[];
};

const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** Repeats each module row 3 times, as rendered. */
function tall(r: { modules: Uint8Array; width: number; rows: number }) {
  const modules = new Uint8Array(r.width * r.rows * 3);
  for (let y = 0; y < r.rows * 3; y++) modules.set(r.modules.subarray(Math.floor(y / 3) * r.width, Math.floor(y / 3 + 1) * r.width), y * r.width);
  return { width: r.width, height: r.rows * 3, modules };
}

async function decode(r: { modules: Uint8Array; width: number; rows: number }) {
  const [res] = await decodeSymbol(tall(r), 3, 2, ['PDF417']);
  return res;
}

describe('PDF417 symbol construction matches bwip-js', () => {
  // Same codewords: length descriptor, padding, Reed-Solomon, row indicators and patterns must agree.
  const cases: [string, number, number][] = [
    ['Hello PDF417 123', 1, 0],
    ['Hello PDF417 123', 3, 2],
    ['0123456789012345678901234567890123456789', 4, 3],
    ['mixed Case: text; with punctuation!? ~ and more', 6, 4],
    ['x'.repeat(200), 10, 5],
    ['long '.repeat(120), 20, 6],
    ['abc', 20, 8],
  ];
  for (const [text, columns, level] of cases) {
    it(`${text.slice(0, 20)}… ${columns} columns, level ${level}`, () => {
      const data = pdf417Codewords(bytes(text));
      const ours = buildPdf417(data, layoutPdf417(data.length, { level, columns }));
      const ref = bwip.raw({ bcid: 'pdf417', text: data.map((c) => `^${String(c).padStart(3, '0')}`).join(''), raw: true, columns, eclevel: level })[0];
      expect(ours.width).toBe(ref.pixx);
      expect(ours.rows).toBe(ref.pixs.length / ref.pixx);
      expect(Array.from(ours.modules)).toEqual(ref.pixs);
    });
  }
});

describe('PDF417 round trip through zxing-cpp', () => {
  const cases: [string, number[], number | undefined][] = [
    ['upper case text', bytes('HELLO WORLD PDF417'), undefined],
    ['mixed text and punctuation', bytes('Hello, World! (PDF417) a@b.jp [x] {y} ~z'), undefined],
    ['long digit run (numeric)', bytes('Order 12345678901234567890123456789012345678901234567890 done'), undefined],
    ['short digits in text', bytes('A1B2C3 45 x'), undefined],
    ['control characters', bytes('A\tB\r\nC'), undefined],
    ['binary (byte)', Array.from({ length: 150 }, (_, i) => (i * 53) & 0xff), undefined],
    ['single byte in text', [...bytes('ABCDE'), 0x00, ...bytes('FGHIJ')], undefined],
    ['URL', bytes('https://example.com/path?query=1&x=ABC#frag'), undefined],
  ];
  for (const [name, data, eci] of cases) {
    it(name, async () => {
      const res = await decode(encodePdf417(data, { level: 'auto', columns: 'auto', eci }));
      expect(Array.from(res!.bytes)).toEqual(data);
    });
  }

  it('UTF-8 with ECI 26', async () => {
    const text = '日本語の PDF417 テスト';
    const res = await decode(encodePdf417(bytes(text), { level: 'auto', columns: 'auto', eci: 26 }));
    expect(res!.text).toBe(text);
  });

  it('every error correction level and a range of column counts decode', async () => {
    const data = bytes('PDF417 level and column sweep 0123456789');
    for (let level = 0; level <= 8; level++) {
      for (const columns of [1, 5, 12, 30]) {
        let r;
        try {
          r = encodePdf417(data, { level, columns });
        } catch {
          continue; // too many codewords for this combination
        }
        const res = await decode(r);
        expect(Array.from(res?.bytes ?? []), `level ${level}, ${columns} columns`).toEqual(data);
      }
    }
  });
});

describe('PDF417 layout', () => {
  it('recommends error correction by data size', () => {
    expect([recommendedLevel(40), recommendedLevel(41), recommendedLevel(161), recommendedLevel(321)]).toEqual([2, 3, 4, 5]);
  });

  it('keeps rows between 3 and 90', () => {
    expect(layoutPdf417(1, { level: 0, columns: 5 }).rows).toBe(3);
    expect(() => layoutPdf417(700, { level: 2, columns: 1 })).toThrow('barcode.error.pdfTooLong');
  });

  it('rejects data beyond 928 codewords', () => {
    expect(() => encodePdf417(Array.from({ length: 1200 }, (_, i) => i & 0xff), { level: 'auto', columns: 'auto' })).toThrow('barcode.error.pdfTooLong');
  });

  it('packs digits and text compactly', () => {
    // 44 digits -> 15 codewords after the numeric latch; 2 text characters per codeword.
    expect(pdf417Codewords(bytes('1'.repeat(44)))).toHaveLength(16);
    expect(pdf417Codewords(bytes('ABCDEFGH'))).toHaveLength(4);
  });
});

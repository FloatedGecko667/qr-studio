import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../../test/decode';
import { aztecBits, buildAztec, chooseAztecLayout, encodeAztec, stuffBits } from './aztec';

const bwip = createRequire(import.meta.url)('bwip-js') as {
  raw: (o: Record<string, unknown>) => { pixs: number[]; pixx: number }[];
};

const bytes = (s: string) => Array.from(new TextEncoder().encode(s));
const wordSize = (layers: number) => (layers <= 2 ? 6 : layers <= 8 ? 8 : layers <= 22 ? 10 : 12);

async function decode(r: { size: number; modules: Uint8Array }) {
  const [res] = await decodeSymbol({ width: r.size, height: r.size, modules: r.modules }, 4, 2, ['Aztec']);
  return res;
}

describe('Aztec symbol construction matches bwip-js', () => {
  // Same message bits: stuffing, Reed-Solomon, mode message, bullseye and reference grid must agree.
  const layouts: [boolean, number][] = [
    ...[1, 2, 3, 4].map((l) => [true, l] as [boolean, number]),
    ...[1, 2, 4, 8, 9, 15, 16, 22, 23, 32].map((l) => [false, l] as [boolean, number]),
  ];
  const all = aztecBits(bytes('Aztec Code 2026: HELLO world 0123456789 '.repeat(120)));
  for (const [compact, layers] of layouts) {
    it(`${compact ? 'compact' : 'full'} ${layers} layers`, () => {
      // About half of the layout's capacity, so the rest is check words (bwip-js limits raw input
      // to a few thousand characters, so large layouts get more check words).
      const bits = all.slice(0, Math.min(3000, Math.floor((((compact ? 88 : 112) + 16 * layers) * layers) / 2)));
      const r = buildAztec(stuffBits(bits, wordSize(layers)), { compact, layers });
      const ref = bwip.raw({ bcid: 'azteccode', text: bits.join(''), raw: true, format: compact ? 'compact' : 'full', layers })[0];
      expect(r.size).toBe(ref.pixx);
      expect(Array.from(r.modules)).toEqual(ref.pixs);
    });
  }
});

describe('Aztec round trip through zxing-cpp', () => {
  const cases: [string, number[]][] = [
    ['upper case', bytes('HELLO AZTEC')],
    ['lower and upper', bytes('Hello Aztec Code World')],
    ['digits', bytes('0123456789012345678901234567890')],
    ['punctuation and pairs', bytes('Hi. Yes, it works: "ok"!\r\n(a) [b] {c} $5 & 10%')],
    ['mixed characters', bytes('a@b\\c^d_e`f|g~h')],
    ['control characters', bytes('A\tB\nC\x1bD')],
    ['binary run', Array.from({ length: 80 }, (_, i) => (i * 97 + 128) & 0xff)],
    ['long binary run (11-bit length)', Array.from({ length: 300 }, (_, i) => 0x80 | (i & 0x7f))],
    ['URL', bytes('https://example.com/path?query=1&x=ABC#frag')],
  ];
  for (const [name, data] of cases) {
    it(name, async () => {
      const res = await decode(encodeAztec(data, { eccPercent: 23 }));
      expect(Array.from(res!.bytes)).toEqual(data);
    });
  }

  it('UTF-8 with ECI 26', async () => {
    const text = '日本語のアステカコード';
    const res = await decode(encodeAztec(bytes(text), { eccPercent: 23, eci: 26 }));
    expect(res!.text).toBe(text);
  });

  it('decodes across sizes from compact to large full-range symbols', async () => {
    for (const n of [1, 20, 60, 150, 400, 1000, 1800]) {
      const data = bytes('Aztec 0123 abc XYZ. '.repeat(100)).slice(0, n);
      const r = encodeAztec(data, { eccPercent: 23 });
      const res = await decode(r);
      expect(Array.from(res?.bytes ?? []), `${n} bytes, ${r.compact ? 'compact' : 'full'} ${r.layers}`).toEqual(data);
    }
  });
});

describe('Aztec layout', () => {
  it('uses the smallest symbol', () => {
    expect(chooseAztecLayout(aztecBits(bytes('A')), 23)).toMatchObject({ compact: true, layers: 1 });
    expect(encodeAztec(bytes('A'), { eccPercent: 23 }).size).toBe(15);
  });

  it('more error correction needs a larger symbol', () => {
    const data = bytes('Error correction level test 0123456789');
    expect(encodeAztec(data, { eccPercent: 80 }).size).toBeGreaterThan(encodeAztec(data, { eccPercent: 10 }).size);
  });

  it('rejects data that does not fit', () => {
    expect(() => encodeAztec(Array.from({ length: 4000 }, (_, i) => i & 0xff), { eccPercent: 23 })).toThrow('barcode.error.aztecTooLong');
  });
});

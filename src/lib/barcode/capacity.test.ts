import { describe, expect, it } from 'vitest';
import { aztecBits, encodeAztec } from './aztec';
import { aztecCapacityRows, dmCapacityRows, dmUsed, pdfCapacityRows } from './capacity';
import { encodeDataMatrix } from './datamatrix';
import { encodePdf417 } from './pdf417';

const repeat = (n: number, v: number) => Array.from({ length: n }, () => v);
const KINDS: [keyof Pick<ReturnType<typeof dmCapacityRows>[number], 'maxDigits' | 'maxUpper' | 'maxBytes'>, number][] = [
  ['maxDigits', 0x31],
  ['maxUpper', 0x41],
  ['maxBytes', 0xe9],
];

const fits = (f: () => unknown) => {
  try {
    f();
    return true;
  } catch {
    return false;
  }
};

describe('Data Matrix capacity', () => {
  it('every size holds exactly its listed maximum', () => {
    for (const r of dmCapacityRows('auto', null)) {
      for (const [key, v] of KINDS) {
        const enc = (n: number) => () => encodeDataMatrix(repeat(n, v), { shape: 'auto', size: r.id });
        expect(fits(enc(r[key])), `${r.id} ${key} ${r[key]}`).toBe(true);
        expect(fits(enc(r[key] + 1)), `${r.id} ${key} ${r[key] + 1}`).toBe(false);
      }
    }
  });

  it('filters by shape and reports the codewords the input needs', () => {
    expect(dmCapacityRows('square', null)).toHaveLength(24);
    expect(dmCapacityRows('rect', null)).toHaveLength(6);
    expect(dmUsed(repeat(6, 0x31))).toBe(3);
    // ECI adds its designator codewords.
    expect(dmUsed(repeat(6, 0x31), 26)).toBe(5);
  });
});

describe('Aztec capacity', () => {
  for (const ecc of [23, 50]) {
    it(`every layout holds exactly its listed maximum at ${ecc}%`, () => {
      for (const r of aztecCapacityRows(ecc, null)) {
        for (const [key, v] of KINDS) {
          const enc = (n: number) => () => encodeAztec(repeat(n, v), { eccPercent: ecc, size: r.id });
          expect(fits(enc(r[key])), `${r.id} ${key} ${r[key]}`).toBe(true);
          expect(fits(enc(r[key] + 1)), `${r.id} ${key} ${r[key] + 1}`).toBe(false);
        }
      }
    });
  }

  it('usage is within the available bits exactly when the layout fits', () => {
    const bytes = Array.from(new TextEncoder().encode('Aztec usage check 0123456789 abc XYZ '.repeat(4)));
    for (const r of aztecCapacityRows(23, aztecBits(bytes))) {
      expect(r.used! <= r.available, r.id).toBe(fits(() => encodeAztec(bytes, { eccPercent: 23, size: r.id })));
    }
  });
});

describe('PDF417 capacity', () => {
  for (const columns of ['auto', 4] as const) {
    it(`every level holds exactly its listed maximum (${columns} columns)`, () => {
      for (const r of pdfCapacityRows(columns, null, () => null)) {
        const level = Number(r.id);
        for (const [key, v] of KINDS) {
          const enc = (n: number) => () => encodePdf417(repeat(n, v), { level, columns: columns === 'auto' ? 30 : columns });
          // Too many check codewords for the columns: the row offers nothing.
          if (r.available <= 1) expect(r[key]).toBe(0);
          else expect(fits(enc(r[key])), `level ${level} ${key} ${r[key]}`).toBe(true);
          expect(fits(enc(r[key] + 1)), `level ${level} ${key} ${r[key] + 1}`).toBe(false);
        }
      }
    });
  }
});

describe('capacity performance', () => {
  it('builds every table quickly', () => {
    const start = performance.now();
    dmCapacityRows('auto', null);
    aztecCapacityRows(37, null);
    pdfCapacityRows(7, null, () => null);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

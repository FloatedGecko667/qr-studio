import { describe, expect, it } from 'vitest';
import { capacityRow, capacityRows } from './capacity';
import { encode, prepareText } from './index';
import { symbolSpec, type EcLevel, type SymbolType } from './symbols';

const cap = (type: SymbolType, v: number, l: EcLevel) => {
  const r = capacityRow(symbolSpec(type, v, l), {});
  return [r.numeric, r.alnum, r.byte, r.kanji];
};

describe('capacity table', () => {
  it('matches published Model 2 capacities', () => {
    expect(cap('model2', 1, 'L')).toEqual([41, 25, 17, 10]);
    expect(cap('model2', 1, 'H')).toEqual([17, 10, 7, 4]);
    expect(cap('model2', 10, 'M')).toEqual([513, 311, 213, 131]);
    expect(cap('model2', 40, 'L')).toEqual([7089, 4296, 2953, 1817]);
    expect(cap('model2', 40, 'H')).toEqual([3057, 1852, 1273, 784]);
  });

  it('matches published Micro QR capacities', () => {
    expect(cap('micro', 1, 'L')).toEqual([5, null, null, null]);
    expect(cap('micro', 2, 'L')).toEqual([10, 6, null, null]);
    expect(cap('micro', 3, 'M')).toEqual([18, 11, 7, 4]);
    expect(cap('micro', 4, 'L')).toEqual([35, 21, 15, 9]);
    expect(cap('micro', 4, 'Q')).toEqual([21, 13, 9, 5]);
  });

  it('matches published rMQR capacities', () => {
    expect(cap('rmqr', 0, 'M')).toEqual([12, 7, 5, 3]); // R7x43
    expect(cap('rmqr', 31, 'M')).toEqual([361, 219, 150, 92]); // R17x139
    // 76 data codewords per ISO/IEC 23941 Table 8 (zxing-cpp and rmqrcode-python agree)
    expect(cap('rmqr', 31, 'H')).toEqual([178, 108, 74, 46]);
  });

  it('multiplies by the structured append count after subtracting headers', () => {
    const row = capacityRow(symbolSpec('model2', 1, 'L'), { structuredAppend: 3 });
    // 152 data bits - 20 header bits = 132; numeric header 14 -> 118 bits -> 35 digits
    expect(row.numeric).toBe(35 * 3);
    expect(capacityRow(symbolSpec('micro', 4, 'L'), { structuredAppend: 2 }).unsupported).toBe('structured-append');
  });

  it('lists 160 Model 2, 8 Micro and 64 rMQR rows', () => {
    expect(capacityRows('model2', {})).toHaveLength(160);
    expect(capacityRows('micro', {})).toHaveLength(8);
    expect(capacityRows('rmqr', {})).toHaveLength(64);
  });

  it('is exact: the maximum fits and one more character does not', () => {
    const samples: Record<'numeric' | 'alnum' | 'byte' | 'kanji', string> = {
      numeric: '7',
      alnum: 'Z',
      byte: 'a',
      kanji: '漢',
    };
    for (const type of ['model2', 'micro', 'rmqr'] as SymbolType[]) {
      for (const row of capacityRows(type, {})) {
        for (const mode of ['numeric', 'alnum', 'byte', 'kanji'] as const) {
          const n = row[mode];
          if (n === null || n === 0) continue;
          const opts = { type, ecLevel: row.spec.ecLevel, version: row.spec.version, mask: 0 } as const;
          const ok = prepareText(samples[mode].repeat(n), 'sjis').units;
          expect(() => encode(ok, opts), `${row.spec.label} ${mode} ${n}`).not.toThrow();
          const over = prepareText(samples[mode].repeat(n + 1), 'sjis').units;
          expect(() => encode(over, opts), `${row.spec.label} ${mode} ${n + 1}`).toThrow();
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../../test/decode';
import { capacityRow } from './capacity';
import { ECI_FOR_CHARSET, encode, prepareBytes, prepareText, type EncodeOptions } from './index';
import { ecLevelsFor, symbolSpec, versionsFor, type SymbolType } from './symbols';

const TEXT = 'QR Studio 2026 https://example.com/?q=テスト漢字';

/** Deterministic text sized to a fraction of a symbol's byte capacity. */
function fill(len: number): string {
  let s = '';
  for (let i = 0; s.length < len; i++) s += TEXT[i % TEXT.length];
  return s.slice(0, len);
}

async function roundTrip(text: string, opts: EncodeOptions): Promise<string> {
  const { units } = prepareText(text);
  const sym = encode(units, opts).symbols[0];
  const [res] = await decodeSymbol(sym);
  return res ? res.text : '<no decode>';
}

describe('round trip through zxing-cpp', () => {
  for (const type of ['model2', 'micro', 'rmqr'] as SymbolType[]) {
    it(`decodes every ${type} version and EC level`, async () => {
      for (const v of versionsFor(type)) {
        for (const l of ecLevelsFor(type, v)) {
          const row = capacityRow(symbolSpec(type, v, l), {});
          const text = row.byte ? fill(Math.max(1, Math.floor(row.byte * 0.5))) : '0123456789'.slice(0, row.numeric!);
          // Characters outside ASCII take 2 bytes; keep only what still fits.
          const opts: EncodeOptions = { type, ecLevel: l, version: v, mask: 'auto' };
          let t = text;
          for (;;) {
            try {
              encode(prepareText(t).units, opts);
              break;
            } catch {
              t = t.slice(0, -1);
            }
          }
          expect(await roundTrip(t, opts), `${row.spec.label}`).toBe(t);
        }
      }
    }, 60_000);
  }

  it('decodes every mask pattern', async () => {
    for (let mask = 0; mask < 8; mask++) {
      expect(await roundTrip(TEXT, { type: 'model2', ecLevel: 'M', version: 'auto', mask })).toBe(TEXT);
    }
    for (let mask = 0; mask < 4; mask++) {
      expect(await roundTrip('MICRO42', { type: 'micro', ecLevel: 'L', version: 'auto', mask })).toBe('MICRO42');
    }
  });

  it('encodes UTF-8 with an ECI designator', async () => {
    const text = 'Emoji 😀 and ü';
    const { units, charset } = prepareText(text);
    expect(charset).toBe('utf8');
    for (const type of ['model2', 'rmqr'] as const) {
      const sym = encode(units, { type, ecLevel: 'M', version: 'auto', mask: 'auto', eci: ECI_FOR_CHARSET.utf8 }).symbols[0];
      const [res] = await decodeSymbol(sym);
      expect(res.text).toBe(text);
      expect(res.hasECI).toBe(true);
    }
  });

  it('encodes GS1 data with FNC1 in first position', async () => {
    const { units } = prepareText('01049123451234591012AB\x1d3103000189', 'sjis', true);
    const sym = encode(units, { type: 'model2', ecLevel: 'M', version: 'auto', mask: 'auto', fnc1: true }).symbols[0];
    const [res] = await decodeSymbol(sym);
    expect(res.contentType).toBe('GS1');
    expect(res.text).toBe('(01)04912345123459(10)12AB(3103)000189');
  });

  it('splits data across structured append symbols', async () => {
    const text = fill(300);
    const { units } = prepareText(text);
    const result = encode(units, { type: 'model2', ecLevel: 'M', version: 'auto', mask: 'auto', structuredAppend: 4 });
    expect(result.symbols).toHaveLength(4);
    const parts: string[] = [];
    for (const [i, sym] of result.symbols.entries()) {
      const [res] = await decodeSymbol(sym);
      expect(res.sequenceIndex).toBe(i);
      expect(res.sequenceSize).toBe(4);
      parts.push(res.text);
    }
    expect(parts.join('')).toBe(text);
  });

  it('round-trips arbitrary binary data', async () => {
    const bytes = Uint8Array.from({ length: 200 }, (_, i) => (i * 97 + 13) & 0xff);
    const sym = encode(prepareBytes(bytes).units, { type: 'model2', ecLevel: 'L', version: 'auto', mask: 'auto' }).symbols[0];
    const [res] = await decodeSymbol(sym);
    expect(Array.from(res.bytes)).toEqual(Array.from(bytes));
  });

  it('chooses mixed modes for mixed content', async () => {
    const text = '12345678901234567890ABCDEFGHIJ漢字かなabc';
    expect(await roundTrip(text, { type: 'model2', ecLevel: 'Q', version: 'auto', mask: 'auto' })).toBe(text);
  });
});

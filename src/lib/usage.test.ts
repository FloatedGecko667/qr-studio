import { describe, expect, it } from 'vitest';
import { buildText } from './payload';
import { preparePayload, runPipeline, type Prepared } from './pipeline';
import { DEFAULT_SYMBOL, type SymbolSettings } from './settings';
import { computeUsage } from './usage';

function usage(text: string, symbol: SymbolSettings) {
  const payload = buildText({ text });
  const prepared = preparePayload(payload, symbol.charset) as Prepared;
  return computeUsage(prepared, symbol, runPipeline(payload, symbol), Array.from(text).length);
}

describe('computeUsage', () => {
  it('counts characters and bytes and compares with the current symbol', () => {
    const u = usage('HELLO 漢字', { ...DEFAULT_SYMBOL, structuredAppend: 1 });
    expect(u.chars).toBe(8);
    expect(u.bytes).toBe(10);
    expect(u.current).toMatchObject({ label: '1-M', count: 1, limitBits: 128 });
    expect(u.limit).toMatchObject({ label: '40-M', count: 1, limitBits: 2334 * 8 });
    // Version 40 uses wider character count indicators, so it needs a few more bits.
    expect(u.limit.usedBits).toBeGreaterThan(u.current!.usedBits);
    expect(u.limit.usedBits - u.current!.usedBits).toBeLessThan(16);
  });

  it('uses the fixed version and 16 symbols as the limit for auto append', () => {
    const u = usage('x'.repeat(500), { ...DEFAULT_SYMBOL, version: 10 });
    expect(u.limit).toMatchObject({ label: '10-M', count: 16, limitBits: (216 * 8 - 20) * 16 });
    expect(u.current).toMatchObject({ label: '10-M', count: 3 });
  });

  it('reports usage over the limit when data does not fit', () => {
    const u = usage('x'.repeat(300), { ...DEFAULT_SYMBOL, version: 5, structuredAppend: 1 });
    expect(u.current).toBeNull();
    expect(u.limit.usedBits).toBeGreaterThan(u.limit.limitBits);
  });
});

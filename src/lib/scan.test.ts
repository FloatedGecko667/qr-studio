import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../test/decode';
import { buildOptimized, DEFAULT_OPTIMIZE } from './optimize';
import { runPipeline } from './pipeline';
import { decodeBytes, SequenceCollector } from './scan';
import { DEFAULT_SYMBOL } from './settings';

describe('SequenceCollector', () => {
  it('merges structured-append symbols in any order', async () => {
    const text = '連結QRのテスト。'.repeat(120);
    const r = runPipeline(buildOptimized('text', { text }, DEFAULT_OPTIMIZE), { ...DEFAULT_SYMBOL, structuredAppend: 3 });
    if (r.status !== 'ok') throw new Error('encode failed');
    const scanned = [];
    for (const sym of r.result.symbols) scanned.push((await decodeSymbol(sym))[0]);
    const c = new SequenceCollector();
    expect(c.add(scanned[2])).toBeNull();
    expect(c.add(scanned[0])).toBeNull();
    expect(c.pending()).toEqual([[2, 3]]);
    expect(c.add(scanned[1])).toEqual({ text, format: 'QRCode', compressed: false, parts: 3 });
  });

  it('inflates compressed single symbols and structured-append sequences', async () => {
    const text = 'Compressed text sample. '.repeat(400);
    const opt = { ...DEFAULT_OPTIMIZE, deflate: true };
    for (const structuredAppend of [1, 2] as const) {
      const r = runPipeline(buildOptimized('text', { text }, opt), { ...DEFAULT_SYMBOL, structuredAppend });
      if (r.status !== 'ok') throw new Error('encode failed');
      const c = new SequenceCollector();
      let out = null;
      for (const sym of r.result.symbols) out = c.add((await decodeSymbol(sym))[0]);
      expect(out).toMatchObject({ text, compressed: true, parts: structuredAppend });
    }
  });

  it('falls back to Shift_JIS for non-UTF-8 bytes', () => {
    expect(decodeBytes(Uint8Array.of(0x93, 0xfa, 0x96, 0x7b))).toEqual({ text: '日本', compressed: false });
  });
});

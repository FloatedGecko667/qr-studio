import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../test/decode';
import { buildOptimized, DEFAULT_OPTIMIZE } from './optimize';
import { runPipeline } from './pipeline';
import { decodeBytes, missing, partialView, received, SequenceCollector, type PartialSequence } from './scan';
import { isValidPartial } from './storage/scanStore';
import { DEFAULT_SYMBOL } from './settings';

describe('SequenceCollector', () => {
  it('merges structured-append symbols in any order', async () => {
    const text = '連結QRのテスト。'.repeat(120);
    const r = runPipeline(buildOptimized('text', { text }, DEFAULT_OPTIMIZE), { ...DEFAULT_SYMBOL, structuredAppend: 3 });
    if (r.status !== 'ok') throw new Error('encode failed');
    const scanned = [];
    for (const sym of r.result.symbols) scanned.push((await decodeSymbol(sym))[0]);
    const c = new SequenceCollector();
    expect(c.add(scanned[2]).outcome).toBeNull();
    expect(c.add(scanned[0]).outcome).toBeNull();
    const [p] = c.list();
    expect([received(p), missing(p), p.last]).toEqual([[0, 2], [1], 0]);
    expect(c.add(scanned[1]).outcome).toMatchObject({ text, format: 'QRCode', compressed: false, parts: 3 });
  });

  it('inflates compressed single symbols and structured-append sequences', async () => {
    const text = 'Compressed text sample. '.repeat(400);
    const opt = { ...DEFAULT_OPTIMIZE, deflate: true };
    for (const structuredAppend of [1, 2] as const) {
      const r = runPipeline(buildOptimized('text', { text }, opt), { ...DEFAULT_SYMBOL, structuredAppend });
      if (r.status !== 'ok') throw new Error('encode failed');
      const c = new SequenceCollector();
      let out = null;
      for (const sym of r.result.symbols) out = c.add((await decodeSymbol(sym))[0]).outcome;
      expect(out).toMatchObject({ text, compressed: true, parts: structuredAppend });
    }
  });

  it('falls back to Shift_JIS for non-UTF-8 bytes', () => {
    expect(decodeBytes(Uint8Array.of(0x93, 0xfa, 0x96, 0x7b))).toEqual({ text: '日本', compressed: false });
  });
});

async function scannedParts(text: string, count: number, deflate = false) {
  const opt = { ...DEFAULT_OPTIMIZE, deflate };
  const r = runPipeline(buildOptimized('text', { text }, opt), { ...DEFAULT_SYMBOL, structuredAppend: count });
  if (r.status !== 'ok') throw new Error('encode failed');
  const out = [];
  for (const sym of r.result.symbols) out.push((await decodeSymbol(sym))[0]);
  return out;
}

describe('partial structured-append data', () => {
  it('shows received parts with gaps and resumes after a reload', async () => {
    const text = 'あいうえお かきくけこ 0123456789 '.repeat(60);
    const parts = await scannedParts(text, 4);
    const first = new SequenceCollector();
    first.add(parts[0]);
    first.add(parts[2]);
    const saved = first.list()[0];

    const view = partialView(saved);
    expect(view.compressed).toBe(false);
    expect(view.segments.map((s) => s.kind)).toEqual(['text', 'missing', 'text', 'missing']);
    const recovered = view.segments.filter((s) => s.kind === 'text').map((s) => (s as { text: string }).text);
    // Every recovered piece is real text from the original (no mojibake at part boundaries).
    for (const piece of recovered) {
      expect(piece.length).toBeGreaterThan(0);
      expect(text).toContain(piece.replace(/^\s+|\s+$/g, '').slice(0, 20));
      expect(piece).not.toContain('\ufffd');
    }

    // A new session (e.g. after the camera stopped) continues from the saved parts.
    const second = new SequenceCollector();
    second.load([saved]);
    expect(second.add(parts[1]).outcome).toBeNull();
    expect(second.add(parts[3]).outcome).toMatchObject({ text, parts: 4 });
    expect(second.list()).toEqual([]);
  });

  it('inflates compressed data only from the first symbol onwards', async () => {
    // Varied text so symbol 1 holds more than the deflate header.
    let seed = 7;
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
    const text = Array.from({ length: 900 }, () => words[(seed = (seed * 48271) % 2147483647) % words.length] + (seed % 97)).join(' ');
    const parts = await scannedParts(text, 3, true);
    const c = new SequenceCollector();
    c.add(parts[0]);
    c.add(parts[2]);
    const view = partialView(c.list()[0]);
    expect(view.compressed).toBe(true);
    expect(view.segments.map((s) => [s.kind, s.from, s.to])).toEqual([
      ['text', 0, 0],
      ['missing', 1, 2],
    ]);
    const prefix = (view.segments[0] as { text: string }).text;
    expect(prefix.length).toBeGreaterThan(0);
    expect(text.startsWith(prefix)).toBe(true);
  });

  it('decodes Shift_JIS parts without mojibake', () => {
    const sjis = (s: string) => {
      // Shift_JIS bytes for a few kana, built by hand to avoid an encoder dependency.
      const table: Record<string, number[]> = { あ: [0x82, 0xa0], い: [0x82, 0xa2] };
      return Uint8Array.from(Array.from(s).flatMap((ch) => table[ch]));
    };
    const p: PartialSequence = { key: 'k/3', sequenceId: 'k', total: 3, format: 'QRCode', parts: { 0: sjis('あい'), 2: sjis('いあ') }, last: 2, updatedAt: 1 };
    const texts = partialView(p).segments.filter((s) => s.kind === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toEqual(['あい', 'いあ']);
  });
});

describe('structured-append safety', () => {
  /** Two different messages with the same parity (x^y = C^B = 1) and symbol count. */
  async function twins() {
    const a = await scannedParts('A'.repeat(200) + 'xy', 2);
    const b = await scannedParts('B'.repeat(200) + 'CB', 2);
    expect(a[0].sequenceId).toBe(b[0].sequenceId);
    return { a, b };
  }

  it('never merges parts of two messages that share parity and size', async () => {
    const { a, b } = await twins();
    const c = new SequenceCollector();
    c.add(a[0]);
    const r = c.add(b[1]);
    expect(r.outcome).toBeNull();
    expect(r.conflict).toBe(true);
    // Only the fresh symbol is kept; completing message B then works.
    expect(received(c.list()[0])).toEqual([1]);
    expect(c.add(b[0]).outcome?.text.startsWith('BBB')).toBe(true);
  });

  it('reports a re-read of the same symbol as unchanged', async () => {
    const parts = await scannedParts('再読み取りのテスト'.repeat(50), 3);
    const c = new SequenceCollector();
    expect(c.add(parts[0]).changed).toBe(true);
    expect(c.add(parts[0])).toMatchObject({ changed: false, conflict: false, outcome: null });
  });

  it('merges saved parts with parts read before loading finished', async () => {
    const text = '読み込み競合のテスト'.repeat(50);
    const parts = await scannedParts(text, 3);
    const earlier = new SequenceCollector();
    earlier.add(parts[1]);
    earlier.add(parts[2]);
    const saved = earlier.list();
    const c = new SequenceCollector();
    c.add(parts[0]);
    c.load(saved);
    expect(received(c.list()[0])).toEqual([0, 1, 2]);
  });

  it('keeps at most ten incomplete sequences', async () => {
    const c = new SequenceCollector();
    for (let i = 0; i < 12; i++) {
      // An odd repeat count keeps the parities distinct.
      const [first] = await scannedParts(`message ${i} `.repeat(41), 2);
      c.add(first);
    }
    expect(c.list().length).toBe(10);
  });

  it('flags data that is neither UTF-8 nor Shift_JIS', () => {
    const p: PartialSequence = { key: 'QRCode/5/3', sequenceId: '5', total: 3, format: 'QRCode', parts: { 1: Uint8Array.of(0x00, 0xff, 0x01, 0x80, 0x02) }, last: 1, updatedAt: 1 };
    const v = partialView(p);
    expect(v.undecodable).toBe(true);
    expect(v.segments.every((seg) => seg.kind === 'missing' || seg.text === '')).toBe(true);
  });

  it('validates stored records strictly', () => {
    const good: PartialSequence = { key: 'QRCode/7/2', sequenceId: '7', total: 2, format: 'QRCode', parts: { 1: Uint8Array.of(1) }, last: 1, updatedAt: 1 };
    expect(isValidPartial(good)).toBe(true);
    expect(isValidPartial({ ...good, parts: { '01': Uint8Array.of(1) } })).toBe(false);
    expect(isValidPartial({ ...good, parts: { '1.0': Uint8Array.of(1) } })).toBe(false);
    expect(isValidPartial({ ...good, parts: { 2: Uint8Array.of(1) } })).toBe(false);
    expect(isValidPartial({ ...good, parts: { 1: [1] } })).toBe(false);
    expect(isValidPartial({ ...good, key: '7/2' })).toBe(false);
    expect(isValidPartial({ ...good, last: 5 })).toBe(false);
    expect(isValidPartial({ ...good, total: 40 })).toBe(false);
    expect(isValidPartial(null)).toBe(false);
  });
});

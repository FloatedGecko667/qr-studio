import { describe, expect, it } from 'vitest';
import { normalizeSymbol } from './normalize';
import { buildGs1, buildText } from './payload';
import { runPipeline } from './pipeline';
import { DEFAULT_SYMBOL } from './settings';

describe('pipeline', () => {
  it('encodes valid payloads', () => {
    const r = runPipeline(buildText({ text: 'hello' }), DEFAULT_SYMBOL);
    expect(r.status).toBe('ok');
  });

  it('reports builder errors', () => {
    expect(runPipeline(buildText({ text: '' }), DEFAULT_SYMBOL)).toEqual({ status: 'invalid', errors: ['payload.required'] });
  });

  it('reports characters outside a forced charset', () => {
    expect(runPipeline(buildText({ text: '😀' }), { ...DEFAULT_SYMBOL, charset: 'sjis' }).status).toBe('charset');
  });

  it('suggests a larger version, a lower EC level and structured append', () => {
    const text = 'x'.repeat(2400);
    const r = runPipeline(buildText({ text }), { ...DEFAULT_SYMBOL, ecLevel: 'H', version: 10 });
    expect(r.status).toBe('too-long');
    if (r.status !== 'too-long') return;
    expect(r.suggestions).toEqual([
      // 40-M holds 2331 bytes, 40-L 2953; two 40-H symbols hold 2 x 1271.
      { type: 'ecLevel', ecLevel: 'L' },
      { type: 'structuredAppend', count: 2 },
    ]);
    const fixed = runPipeline(buildText({ text: 'x'.repeat(200) }), { ...DEFAULT_SYMBOL, version: 5 });
    expect(fixed.status === 'too-long' && fixed.suggestions[0]).toEqual({ type: 'version', version: 10 });
  });

  it('suggests Model 2 when Micro QR is too small', () => {
    const r = runPipeline(buildText({ text: 'https://example.com/long/path' }), normalizeSymbol({ ...DEFAULT_SYMBOL, type: 'micro' }));
    expect(r.status === 'too-long' && r.suggestions).toEqual([{ type: 'model2' }]);
  });

  it('rejects GS1 on Micro QR', () => {
    const r = runPipeline(buildGs1({ value: '(01)04912345123459' }), normalizeSymbol({ ...DEFAULT_SYMBOL, type: 'micro' }));
    expect(r).toEqual({ status: 'unsupported', feature: 'fnc1' });
  });
});

describe('normalizeSymbol', () => {
  it('repairs combinations after switching type', () => {
    expect(normalizeSymbol({ ...DEFAULT_SYMBOL, type: 'rmqr', ecLevel: 'L', mask: 3, structuredAppend: 4 })).toMatchObject({
      ecLevel: 'M',
      mask: 'auto',
      structuredAppend: 1,
    });
    expect(normalizeSymbol({ ...DEFAULT_SYMBOL, type: 'micro', ecLevel: 'H', eci: true })).toMatchObject({ ecLevel: 'Q', eci: false });
    expect(normalizeSymbol({ ...DEFAULT_SYMBOL, type: 'micro', ecLevel: 'M', version: 1 })).toMatchObject({ ecLevel: 'L', version: 1 });
    expect(normalizeSymbol({ ...DEFAULT_SYMBOL, version: 41 }).version).toBe('auto');
  });
});

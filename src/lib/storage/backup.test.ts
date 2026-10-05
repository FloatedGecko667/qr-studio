import { describe, expect, it } from 'vitest';
import { MAX_BACKUP_BYTES, parseBackup } from './backup';

const file = (extra: Record<string, unknown>) =>
  JSON.stringify({ format: 'qr-studio-backup', version: 1, createdAt: '2026-10-05T00:00:00Z', ...extra });

describe('parseBackup', () => {
  it('rejects other files, newer versions and oversized input', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ format: 'qr-studio-history', version: 1, items: [] }))).toBeNull();
    expect(parseBackup(file({ version: 2 }))).toBeNull();
    expect(parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toBeNull();
  });

  it('keeps only valid presets, history and scan log rows', () => {
    const b = parseBackup(
      file({
        settings: { qr: { theme: 'dark' }, barcode: 'nope', scanPrefs: { beep: true } },
        presets: [
          { id: 'p1', name: 'Blue', createdAt: 1, style: { fg: '#0000ff', nested: { x: 1 } }, logoDataUrl: 'javascript:alert(1)' },
          { id: 2, name: 'bad' },
        ],
        templates: [{ id: 't1' }],
        history: [{ id: 'h1', createdAt: 1, kind: 'url', fields: { url: 'https://example.com' }, symbol: {}, style: {}, logoDataUrl: null, summary: 's' }, { id: 'x' }],
        scanLog: [{ id: 's1', text: 'a', format: 'QRCode', count: 1, firstAt: 1, lastAt: 1 }, { id: 's2', count: 0 }],
      }),
    )!;
    expect(b.settings.qr).toEqual({ theme: 'dark' });
    expect(b.settings.barcode).toBeUndefined();
    expect(b.presets).toEqual([{ id: 'p1', name: 'Blue', createdAt: 1, style: { fg: '#0000ff' }, logoDataUrl: null }]);
    expect(b.history.map((h) => h.id)).toEqual(['h1']);
    expect(b.scanLog.map((e) => e.id)).toEqual(['s1']);
    expect(b.summary).toMatchObject({ settings: 2, presets: 1, history: 1, scanLog: 1 });
  });

  it('decodes binary history fields', () => {
    const b = parseBackup(
      file({ history: [{ id: 'h', createdAt: 1, kind: 'binary', fields: { file: { $bytes: 'AQID' } }, symbol: {}, style: {}, logoDataUrl: null, summary: '' }] }),
    )!;
    expect(b.history[0].fields.file).toEqual(new Uint8Array([1, 2, 3]));
  });
});

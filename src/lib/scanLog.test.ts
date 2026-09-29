import { describe, expect, it } from 'vitest';
import { addRead, csvCell, REPEAT_COOLDOWN_MS, SCAN_LOG_LIMIT, toCsv, validEntries, type ScanLogEntry } from './scanLog';

let n = 0;
const id = () => `id${++n}`;
const read = (text: string, format = 'QRCode') => ({ text, format });

describe('addRead', () => {
  it('adds new reads on top', () => {
    let log: ScanLogEntry[] = [];
    log = addRead(log, read('a'), 'each', 0, id).log;
    const r = addRead(log, read('b'), 'each', 10, id);
    expect(r.result).toBe('added');
    expect(r.log.map((e) => e.text)).toEqual(['b', 'a']);
  });

  it('ignores the same code within the cooldown, but not after it', () => {
    let log = addRead([], read('a'), 'each', 0, id).log;
    const held = addRead(log, read('a'), 'each', REPEAT_COOLDOWN_MS - 1, id);
    expect(held.result).toBe('repeat');
    expect(held.log).toHaveLength(1);
    // Holding it keeps extending the cooldown.
    log = held.log;
    expect(addRead(log, read('a'), 'each', REPEAT_COOLDOWN_MS + 500, id).result).toBe('repeat');
    expect(addRead(log, read('a'), 'each', 2 * REPEAT_COOLDOWN_MS, id).result).toBe('added');
  });

  it('treats the same text in another format as a different code', () => {
    const log = addRead([], read('123', 'EAN-13'), 'each', 0, id).log;
    expect(addRead(log, read('123', 'Code128'), 'each', 1, id).result).toBe('added');
  });

  it('count mode merges repeats and moves them to the top', () => {
    let log: ScanLogEntry[] = [];
    for (const [t, at] of [['a', 0], ['b', 5000], ['a', 10_000]] as const) log = addRead(log, read(t), 'count', at, id).log;
    expect(log.map((e) => [e.text, e.count])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(log[0].firstAt).toBe(0);
    expect(log[0].lastAt).toBe(10_000);
  });

  it('keeps at most SCAN_LOG_LIMIT rows', () => {
    let log: ScanLogEntry[] = [];
    for (let i = 0; i <= SCAN_LOG_LIMIT; i++) log = addRead(log, read(String(i)), 'each', i * 10_000, id).log;
    expect(log).toHaveLength(SCAN_LOG_LIMIT);
    expect(log[0].text).toBe(String(SCAN_LOG_LIMIT));
  });
});

describe('validEntries', () => {
  it('drops malformed rows', () => {
    const good = { id: 'x', text: 't', format: 'QRCode', count: 1, firstAt: 1, lastAt: 2 };
    expect(validEntries([good, { ...good, count: 0 }, { ...good, text: 1 }, null, 'x'])).toEqual([good]);
    expect(validEntries({})).toEqual([]);
  });
});

describe('CSV', () => {
  it('quotes and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"\nok')).toBe('"say ""hi""\nok"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+81')).toBe("'+81");
    expect(csvCell('@SUM(1)')).toBe("'@SUM(1)");
  });

  it('writes a BOM, a header and rows oldest first', () => {
    const log = [
      { id: '2', text: 'b', format: 'EAN-13', count: 3, firstAt: 0, lastAt: Date.UTC(2026, 8, 29, 1) },
      { id: '1', text: 'a', format: 'QRCode', count: 1, firstAt: 0, lastAt: Date.UTC(2026, 8, 29, 0) },
    ];
    expect(toCsv(log, ['time', 'format', 'content', 'count'])).toBe(
      '﻿time,format,content,count\r\n2026-09-29T00:00:00.000Z,QRCode,a,1\r\n2026-09-29T01:00:00.000Z,EAN-13,b,3\r\n',
    );
  });
});

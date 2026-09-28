import { describe, expect, it } from 'vitest';
import { decodeCsv, itemsFromCsv, itemsFromLines, parseCsv, serialLines } from './batch';
import { sanitizeFilename, uniqueNames } from './export/download';

describe('batch input', () => {
  it('parses RFC 4180 CSV', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });

  it('reads content/filename columns and skips blank rows', () => {
    const items = itemsFromCsv('﻿filename,content\nshop/a,https://a.example\n,\nb,"line1\nline2"\n');
    expect(items).toEqual([
      { row: 2, content: 'https://a.example', filename: 'shop_a' },
      { row: 4, content: 'line1\nline2', filename: 'b' },
    ]);
  });

  it('falls back to first column without a header', () => {
    expect(itemsFromCsv('x\ny')).toEqual([
      { row: 1, content: 'x', filename: 'qr-0001' },
      { row: 2, content: 'y', filename: 'qr-0002' },
    ]);
    expect(itemsFromCsv('filename,url\na,b')).toBe('missing-content');
  });

  it('splits lines', () => {
    expect(itemsFromLines('a\n\nb').map((i) => [i.row, i.content])).toEqual([
      [1, 'a'],
      [3, 'b'],
    ]);
  });

  it('decodes UTF-8 and Shift_JIS', () => {
    expect(decodeCsv(new TextEncoder().encode('日本'))).toBe('日本');
    expect(decodeCsv(Uint8Array.from([0x93, 0xfa, 0x96, 0x7b]))).toBe('日本');
  });

  it('sanitizes and de-duplicates file names', () => {
    expect(sanitizeFilename('a/b:c*?.png')).toBe('a_b_c__.png');
    expect(sanitizeFilename('...')).toBe('qr');
    expect(uniqueNames(['a.png', 'A.png', 'a.png', 'a-2.png'])).toEqual(['a.png', 'A-2.png', 'a-3.png', 'a-2-2.png']);
  });
});

describe('serialLines', () => {
  it('pads, steps and caps the count', () => {
    expect(serialLines({ prefix: 'A-', suffix: 'Z', start: 8, step: 2, count: 3, digits: 3 })).toEqual(['A-008Z', 'A-010Z', 'A-012Z']);
    expect(serialLines({ prefix: '', suffix: '', start: 1, step: 1, count: 5000, digits: 0 })).toHaveLength(1000);
    expect(serialLines({ prefix: '', suffix: '', start: NaN, step: NaN, count: 2, digits: NaN })).toEqual(['0', '1']);
  });
});

import { sanitizeFilename } from './export/download';

export const BATCH_LIMIT = 1000;

export interface BatchItem {
  /** 1-based source row for error messages. */
  row: number;
  content: string;
  filename: string;
}

/** Decodes CSV bytes as UTF-8 (with or without BOM), falling back to Shift_JIS. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function defaultName(i: number, prefix: string): string {
  return `${prefix}-${String(i + 1).padStart(4, '0')}`;
}

export function itemsFromLines(text: string, prefix = 'qr'): BatchItem[] {
  const items: BatchItem[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    items.push({ row: i + 1, content: line, filename: defaultName(items.length, prefix) });
  });
  return items;
}

/** Uses the `content` / `filename` header when present, otherwise the first two columns. */
export function itemsFromCsv(text: string, prefix = 'qr'): BatchItem[] | 'missing-content' {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('content');
  const ci = hasHeader ? header.indexOf('content') : 0;
  const fi = hasHeader ? header.indexOf('filename') : 1;
  if (!hasHeader && header.includes('filename')) return 'missing-content';
  const items: BatchItem[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const content = r[ci] ?? '';
    if (content.trim() === '') return;
    const name = fi >= 0 ? (r[fi] ?? '').trim() : '';
    items.push({ row: i + (hasHeader ? 2 : 1), content, filename: sanitizeFilename(name, defaultName(items.length, prefix)) });
  });
  return items;
}

export interface SerialSpec {
  prefix: string;
  suffix: string;
  start: number;
  step: number;
  count: number;
  /** Zero-pad the number to this many digits (0 = no padding). */
  digits: number;
}

/** "A-0001", "A-0002", ... — at most BATCH_LIMIT lines. */
export function serialLines(s: SerialSpec): string[] {
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? Math.trunc(v) : fallback);
  const count = Math.max(0, Math.min(BATCH_LIMIT, num(s.count, 0)));
  const start = num(s.start, 0);
  const step = num(s.step, 1);
  const digits = Math.max(0, Math.min(20, num(s.digits, 0)));
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = start + i * step;
    const body = n < 0 ? `-${String(-n).padStart(digits, '0')}` : String(n).padStart(digits, '0');
    lines.push(`${s.prefix}${body}${s.suffix}`);
  }
  return lines;
}

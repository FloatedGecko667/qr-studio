/** Reads kept in the scan log (oldest dropped first). */
export const SCAN_LOG_LIMIT = 5000;
/** The same code held in front of the camera is logged once per this interval. */
export const REPEAT_COOLDOWN_MS = 2000;

export type ScanLogMode = 'each' | 'count';

export interface ScanLogEntry {
  id: string;
  text: string;
  format: string;
  /** Number of reads merged into this row ('count' mode); 1 in 'each' mode. */
  count: number;
  firstAt: number;
  lastAt: number;
}

export type AddResult = 'added' | 'counted' | 'repeat';

/**
 * Adds a read to `log` (newest first) and returns the new log and what happened. A read equal to
 * the previous one within the cooldown is ignored ('repeat'), so a code held still is not logged
 * on every camera frame. In 'count' mode an earlier row with the same content is incremented and
 * moved to the top instead of adding a row.
 */
export function addRead(
  log: readonly ScanLogEntry[],
  read: { text: string; format: string },
  mode: ScanLogMode,
  now: number,
  newId: () => string,
): { log: ScanLogEntry[]; result: AddResult } {
  const latest = log[0];
  if (latest && latest.text === read.text && latest.format === read.format && now - latest.lastAt < REPEAT_COOLDOWN_MS) {
    const touched = { ...latest, lastAt: now };
    return { log: [touched, ...log.slice(1)], result: 'repeat' };
  }
  if (mode === 'count') {
    const i = log.findIndex((e) => e.text === read.text && e.format === read.format);
    if (i >= 0) {
      const merged = { ...log[i], count: log[i].count + 1, lastAt: now };
      return { log: [merged, ...log.slice(0, i), ...log.slice(i + 1)], result: 'counted' };
    }
  }
  const entry: ScanLogEntry = { id: newId(), text: read.text, format: read.format, count: 1, firstAt: now, lastAt: now };
  return { log: [entry, ...log].slice(0, SCAN_LOG_LIMIT), result: 'added' };
}

/** Stored rows are re-validated; anything malformed is dropped. */
export function validEntries(value: unknown): ScanLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (e): e is ScanLogEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof e.id === 'string' &&
        typeof e.text === 'string' &&
        typeof e.format === 'string' &&
        Number.isInteger(e.count) &&
        e.count >= 1 &&
        Number.isFinite(e.firstAt) &&
        Number.isFinite(e.lastAt),
    )
    .slice(0, SCAN_LOG_LIMIT);
}

/**
 * Quotes a CSV cell (RFC 4180). Cells a spreadsheet would treat as a formula get a leading
 * apostrophe so a scanned code cannot run formulas when the file is opened (CSV injection).
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV (UTF-8 with BOM for Excel), oldest first: time, format, content, count. */
export function toCsv(log: readonly ScanLogEntry[], header: readonly [string, string, string, string]): string {
  const rows = [header.map(csvCell).join(',')];
  for (const e of [...log].reverse()) {
    rows.push([new Date(e.lastAt).toISOString(), e.format, e.text, String(e.count)].map(csvCell).join(','));
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}

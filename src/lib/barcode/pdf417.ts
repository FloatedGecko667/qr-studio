// PDF417 (ISO/IEC 15438): text / byte / numeric compaction, Reed-Solomon over GF(929) and the
// row layout. Codeword bar patterns come from the generated table.
import { PDF417_PATTERNS } from './pdf417Table';
import { BarcodeError } from './types';

const LATCH_TEXT = 900;
const LATCH_BYTE = 901;
const LATCH_NUMERIC = 902;
const SHIFT_BYTE = 913;
const LATCH_BYTE6 = 924;
const ECI = 927;
const PAD = 900;
const MAX_CODEWORDS = 928;
export const PDF417_MAX_ROWS = 90;
export const PDF417_MAX_COLUMNS = 30;
const MIN_ROWS = 3;

const START = [8, 1, 1, 1, 1, 1, 1, 3];
const STOP = [7, 1, 1, 3, 1, 1, 1, 2, 1];

// Text compaction sub-mode tables (ISO/IEC 15438 Table 2). -1: not in the sub-mode.
const MIXED = '0123456789&\r\t,:#-.$/+%*=^';
const PUNCT = ';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'';
const ALPHA = 0;
const LOWER = 1;
const MIXED_MODE = 2;
const PUNCT_MODE = 3;
const LL = 27;
const ML = 28;
const PS = 29;
const AS = 27;
const PL = 25;
const AL_FROM_MIXED = 28;
const AL_FROM_PUNCT = 29;
const SP = 26;

const isDigit = (b: number) => b >= 0x30 && b <= 0x39;
const isUpper = (b: number) => b === 0x20 || (b >= 0x41 && b <= 0x5a);
const isLower = (b: number) => b === 0x20 || (b >= 0x61 && b <= 0x7a);
const mixedIndex = (b: number) => (b === 0x20 ? SP : MIXED.indexOf(String.fromCharCode(b)));
const punctIndex = (b: number) => PUNCT.indexOf(String.fromCharCode(b));
const isMixed = (b: number) => b < 0x80 && mixedIndex(b) >= 0;
const isPunct = (b: number) => b < 0x80 && punctIndex(b) >= 0;
const isText = (b: number) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e);

/** Sub-mode values for a text run; returns the sub-mode at the end. */
function encodeText(bytes: readonly number[], start: number, count: number, out: number[], initial: number): number {
  const v: number[] = [];
  let sub = initial;
  for (let i = start; i < start + count; ) {
    const b = bytes[i];
    if (sub === ALPHA) {
      if (isUpper(b)) v.push(b === 0x20 ? SP : b - 0x41);
      else if (isLower(b)) {
        v.push(LL);
        sub = LOWER;
        continue;
      } else if (isMixed(b)) {
        v.push(ML);
        sub = MIXED_MODE;
        continue;
      } else v.push(PS, punctIndex(b));
    } else if (sub === LOWER) {
      if (isLower(b)) v.push(b === 0x20 ? SP : b - 0x61);
      else if (isUpper(b)) v.push(AS, b - 0x41);
      else if (isMixed(b)) {
        v.push(ML);
        sub = MIXED_MODE;
        continue;
      } else v.push(PS, punctIndex(b));
    } else if (sub === MIXED_MODE) {
      if (isMixed(b)) v.push(mixedIndex(b));
      else if (isUpper(b)) {
        v.push(AL_FROM_MIXED);
        sub = ALPHA;
        continue;
      } else if (isLower(b)) {
        v.push(LL);
        sub = LOWER;
        continue;
      } else if (i + 1 < start + count && isPunct(bytes[i + 1])) {
        v.push(PL);
        sub = PUNCT_MODE;
        continue;
      } else v.push(PS, punctIndex(b));
    } else if (isPunct(b)) v.push(punctIndex(b));
    else {
      v.push(AL_FROM_PUNCT);
      sub = ALPHA;
      continue;
    }
    i++;
  }
  if (v.length % 2) v.push(PS);
  for (let i = 0; i < v.length; i += 2) out.push(v[i] * 30 + v[i + 1]);
  return sub;
}

function base900(value: bigint, digits: number): number[] {
  const out = Array.from({ length: digits }, () => 0);
  for (let i = digits - 1; i >= 0; i--) {
    out[i] = Number(value % 900n);
    value /= 900n;
  }
  return out;
}

function encodeNumeric(bytes: readonly number[], start: number, count: number, out: number[]): void {
  for (let i = 0; i < count; i += 44) {
    const digits = String.fromCharCode(...bytes.slice(start + i, start + Math.min(count, i + 44)));
    let value = BigInt(`1${digits}`);
    const cws: number[] = [];
    while (value > 0n) {
      cws.unshift(Number(value % 900n));
      value /= 900n;
    }
    out.push(...cws);
  }
}

function encodeBytes(bytes: readonly number[], start: number, count: number, textMode: boolean, out: number[]): void {
  if (count === 1 && textMode) {
    out.push(SHIFT_BYTE, bytes[start]);
    return;
  }
  out.push(count % 6 === 0 ? LATCH_BYTE6 : LATCH_BYTE);
  let i = start;
  for (; i + 6 <= start + count; i += 6) {
    let value = 0n;
    for (let j = 0; j < 6; j++) value = value * 256n + BigInt(bytes[i + j]);
    out.push(...base900(value, 5));
  }
  for (; i < start + count; i++) out.push(bytes[i]);
}

function digitRun(bytes: readonly number[], start: number): number {
  let i = start;
  while (i < bytes.length && isDigit(bytes[i])) i++;
  return i - start;
}

/** Text characters from `start`, stopping before a run of 13+ digits (better as numeric). */
function textRun(bytes: readonly number[], start: number): number {
  let i = start;
  while (i < bytes.length) {
    const digits = digitRun(bytes, i);
    if (digits >= 13) return i - start;
    if (digits > 0) {
      i += digits;
      continue;
    }
    if (!isText(bytes[i])) break;
    i++;
  }
  return i - start;
}

/** Bytes from `start` until 13+ digits or 5+ text characters follow. */
function byteRun(bytes: readonly number[], start: number): number {
  let i = start;
  while (i < bytes.length) {
    if (digitRun(bytes, i) >= 13) break;
    let text = 0;
    while (text < 5 && i + text < bytes.length && isText(bytes[i + text])) text++;
    if (text >= 5) break;
    i++;
  }
  return Math.max(1, i - start);
}

/** Data codewords (without the length descriptor) for `bytes`, optionally prefixed with an ECI. */
export function pdf417Codewords(bytes: readonly number[], eci?: number): number[] {
  const out: number[] = [];
  if (eci !== undefined) out.push(ECI, eci);
  let textMode = true;
  let sub = ALPHA;
  for (let p = 0; p < bytes.length; ) {
    const digits = digitRun(bytes, p);
    if (digits >= 13) {
      out.push(LATCH_NUMERIC);
      encodeNumeric(bytes, p, digits, out);
      textMode = false;
      sub = ALPHA;
      p += digits;
      continue;
    }
    const text = textRun(bytes, p);
    if (text >= 5 || (text > 0 && p + text === bytes.length)) {
      if (!textMode) {
        out.push(LATCH_TEXT);
        textMode = true;
        sub = ALPHA;
      }
      sub = encodeText(bytes, p, text, out, sub);
      p += text;
      continue;
    }
    const count = byteRun(bytes, p);
    encodeBytes(bytes, p, count, textMode, out);
    // A single shifted byte keeps text compaction (and its sub-mode) active.
    if (!(count === 1 && textMode)) {
      textMode = false;
      sub = ALPHA;
    }
    p += count;
  }
  return out;
}

// Reed-Solomon over GF(929) with generator roots 3^1 .. 3^k (ISO/IEC 15438 Annex F).
const generators = new Map<number, number[]>();
function generator(k: number): number[] {
  const cached = generators.get(k);
  if (cached) return cached;
  let g = [1];
  let root = 1;
  for (let i = 1; i <= k; i++) {
    root = (root * 3) % 929;
    const next: number[] = Array.from({ length: g.length + 1 }, () => 0);
    for (let j = 0; j < g.length; j++) {
      next[j] = (next[j] + g[j]) % 929;
      next[j + 1] = (next[j + 1] + 929 - ((g[j] * root) % 929)) % 929;
    }
    g = next;
  }
  generators.set(k, g);
  return g;
}

export function pdf417Ecc(data: readonly number[], level: number): number[] {
  const k = 2 ** (level + 1);
  const g = generator(k);
  const ecc = Array.from({ length: k }, () => 0);
  for (const d of data) {
    const t = (d + ecc[0]) % 929;
    for (let j = 0; j < k - 1; j++) ecc[j] = (ecc[j + 1] + 929 - ((t * g[j + 1]) % 929)) % 929;
    ecc[k - 1] = (929 - ((t * g[k]) % 929)) % 929;
  }
  return ecc.map((e) => (929 - e) % 929);
}

/** Error correction level recommended for the amount of data (ISO/IEC 15438 Table E.1). */
export function recommendedLevel(dataCount: number): number {
  if (dataCount <= 40) return 2;
  if (dataCount <= 160) return 3;
  if (dataCount <= 320) return 4;
  return 5;
}

/** Columns chosen so the symbol is about twice as wide as tall (3-module rows). */
function autoColumns(total: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let c = 1; c <= PDF417_MAX_COLUMNS; c++) {
    const rows = Math.max(MIN_ROWS, Math.ceil(total / c));
    if (rows > PDF417_MAX_ROWS) continue;
    const ratio = (69 + 17 * c) / (rows * 3);
    const score = Math.abs(Math.log(ratio / 2)) + (rows * c - total) / total;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface Pdf417Layout {
  columns: number;
  rows: number;
  level: number;
}

export interface Pdf417Result extends Pdf417Layout {
  /** One entry per module row (not repeated for the row height). Row-major, 1 = bar. */
  modules: Uint8Array;
  width: number;
  /** Data codewords used (with the length descriptor) and available at this size and level. */
  used: number;
  capacity: number;
}

/** Chooses the layout and pads `data` (without length descriptor) into full codewords. */
export function layoutPdf417(dataCount: number, opts: { level: number | 'auto'; columns: number | 'auto' }): Pdf417Layout {
  const n = dataCount + 1;
  const level = opts.level === 'auto' ? recommendedLevel(n) : opts.level;
  const total = n + 2 ** (level + 1);
  if (total > MAX_CODEWORDS) throw new BarcodeError('barcode.error.pdfTooLong', { need: total, max: MAX_CODEWORDS });
  const columns = opts.columns === 'auto' ? autoColumns(total) : opts.columns;
  const rows = Math.max(MIN_ROWS, Math.ceil(total / columns));
  if (!columns || rows > PDF417_MAX_ROWS) throw new BarcodeError('barcode.error.pdfTooLong', { need: total, max: columns * PDF417_MAX_ROWS });
  return { columns, rows, level };
}

function appendWidths(row: number[], widths: readonly number[]): void {
  widths.forEach((w, i) => {
    for (let j = 0; j < w; j++) row.push(i % 2 === 0 ? 1 : 0);
  });
}

function appendPattern(row: number[], cluster: number, value: number): void {
  const p = PDF417_PATTERNS[cluster][value];
  for (let b = 16; b >= 0; b--) row.push((p >> b) & 1);
}

/** Builds the symbol from data codewords (without the length descriptor). */
export function buildPdf417(data: readonly number[], layout: Pdf417Layout): Pdf417Result {
  const { columns, rows, level } = layout;
  const k = 2 ** (level + 1);
  const capacity = rows * columns - k;
  const cws = [capacity, ...data];
  while (cws.length < capacity) cws.push(PAD);
  cws.push(...pdf417Ecc(cws, level));

  const width = 17 + 17 + columns * 17 + 17 + 18;
  const modules = new Uint8Array(width * rows);
  for (let r = 0; r < rows; r++) {
    const cluster = r % 3;
    const base = Math.floor(r / 3) * 30;
    const rowsPart = Math.floor((rows - 1) / 3);
    const levelPart = level * 3 + ((rows - 1) % 3);
    const left = base + [rowsPart, levelPart, columns - 1][cluster];
    const right = base + [columns - 1, rowsPart, levelPart][cluster];
    const row: number[] = [];
    appendWidths(row, START);
    appendPattern(row, cluster, left);
    for (let c = 0; c < columns; c++) appendPattern(row, cluster, cws[r * columns + c]);
    appendPattern(row, cluster, right);
    appendWidths(row, STOP);
    modules.set(row, r * width);
  }
  return { ...layout, modules, width, used: data.length + 1, capacity };
}

export function encodePdf417(bytes: readonly number[], opts: { level: number | 'auto'; columns: number | 'auto'; eci?: number }): Pdf417Result {
  const data = pdf417Codewords(bytes, opts.eci);
  return buildPdf417(data, layoutPdf417(data.length, opts));
}

// Data Matrix ECC 200 (ISO/IEC 16022): ASCII, C40, Text and Base256 encodation chosen by dynamic
// programming, Reed-Solomon over GF(256)/0x12D, and the standard "utah" module placement.
import { BarcodeError, type DmShape } from './types';

export type { DmShape };

export interface DmSize {
  rows: number;
  cols: number;
  /** Data region size (without finder / timing patterns). */
  regionRows: number;
  regionCols: number;
  dataCw: number;
  eccCw: number;
  blocks: number;
}

// rows, cols, region rows, region cols, data codewords, EC codewords, interleaved blocks
const TABLE: [number, number, number, number, number, number, number][] = [
  [10, 10, 8, 8, 3, 5, 1],
  [12, 12, 10, 10, 5, 7, 1],
  [8, 18, 6, 16, 5, 7, 1],
  [14, 14, 12, 12, 8, 10, 1],
  [8, 32, 6, 14, 10, 11, 1],
  [16, 16, 14, 14, 12, 12, 1],
  [12, 26, 10, 24, 16, 14, 1],
  [18, 18, 16, 16, 18, 14, 1],
  [20, 20, 18, 18, 22, 18, 1],
  [12, 36, 10, 16, 22, 18, 1],
  [22, 22, 20, 20, 30, 20, 1],
  [16, 36, 14, 16, 32, 24, 1],
  [24, 24, 22, 22, 36, 24, 1],
  [26, 26, 24, 24, 44, 28, 1],
  [16, 48, 14, 22, 49, 28, 1],
  [32, 32, 14, 14, 62, 36, 1],
  [36, 36, 16, 16, 86, 42, 1],
  [40, 40, 18, 18, 114, 48, 1],
  [44, 44, 20, 20, 144, 56, 1],
  [48, 48, 22, 22, 174, 68, 1],
  [52, 52, 24, 24, 204, 84, 2],
  [64, 64, 14, 14, 280, 112, 2],
  [72, 72, 16, 16, 368, 144, 4],
  [80, 80, 18, 18, 456, 192, 4],
  [88, 88, 20, 20, 576, 224, 4],
  [96, 96, 22, 22, 696, 272, 4],
  [104, 104, 24, 24, 816, 336, 6],
  [120, 120, 18, 18, 1050, 408, 6],
  [132, 132, 20, 20, 1304, 496, 8],
  [144, 144, 22, 22, 1558, 620, 10],
];

export const DM_SIZES: DmSize[] = TABLE.map(([rows, cols, regionRows, regionCols, dataCw, eccCw, blocks]) => ({
  rows,
  cols,
  regionRows,
  regionCols,
  dataCw,
  eccCw,
  blocks,
}));

export const dmSizeLabel = (s: Pick<DmSize, 'rows' | 'cols'>) => `${s.rows}x${s.cols}`;

// ---- Reed-Solomon (GF(256), primitive polynomial 0x12D, generator roots α^1..α^n) ----

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x12d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const generators = new Map<number, Uint8Array>();
/** Generator coefficients, highest degree first, leading 1 omitted. */
function generator(n: number): Uint8Array {
  const cached = generators.get(n);
  if (cached) return cached;
  // poly[0] is the leading coefficient.
  let poly = [1];
  for (let i = 1; i <= n; i++) {
    const next = Array.from({ length: poly.length + 1 }, (): number => 0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  const g = Uint8Array.from(poly.slice(1));
  generators.set(n, g);
  return g;
}

function rs(data: readonly number[], n: number): number[] {
  const g = generator(n);
  const rem = Array.from({ length: n }, (): number => 0);
  for (const d of data) {
    const f = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(g[j], f);
  }
  return rem;
}

/** Appends interleaved error correction codewords to the (padded) data codewords. */
export function withEcc(data: readonly number[], size: DmSize): number[] {
  const out = [...data, ...Array.from({ length: size.eccCw }, (): number => 0)];
  const eccPerBlock = size.eccCw / size.blocks;
  for (let b = 0; b < size.blocks; b++) {
    const blockData: number[] = [];
    for (let i = b; i < size.dataCw; i += size.blocks) blockData.push(data[i]);
    const ecc = rs(blockData, eccPerBlock);
    // 144x144 is the one size with unequal blocks; its EC codewords start with block 8.
    const slot = size.rows === 144 ? (b + 2) % size.blocks : b;
    ecc.forEach((e, k) => (out[size.dataCw + slot + k * size.blocks] = e));
  }
  return out;
}

// ---- High-level encodation ----

/** Input unit: a byte (0-255) or FNC1 (GS1). */
export type DmToken = number | 'FNC1';

const PAD = 129;
const LATCH_C40 = 230;
const LATCH_B256 = 231;
const FNC1 = 232;
const UPPER_SHIFT = 235;
const LATCH_TEXT = 239;
const ECI = 241;
const UNLATCH = 254;

const isDigit = (t: DmToken | undefined): t is number => typeof t === 'number' && t >= 48 && t <= 57;

/** C40 / Text values for one token (1-4 values; shifts and upper shift included). */
function tripletValues(t: DmToken, text: boolean): number[] {
  if (t === 'FNC1') return [1, 27];
  if (t >= 128) return [1, 30, ...tripletValues(t - 128, text)];
  if (t === 32) return [3];
  if (t >= 48 && t <= 57) return [t - 44];
  const upper = t >= 65 && t <= 90;
  const lower = t >= 97 && t <= 122;
  if ((!text && upper) || (text && lower)) return [t - (text ? 97 : 65) + 14];
  if (t < 32) return [0, t];
  if (t <= 47) return [1, t - 33];
  if (t <= 64) return [1, t - 58 + 15];
  if (t <= 95 && !(text && upper)) return [1, t - 91 + 22];
  // Shift 3: C40 has ` a-z { | } ~ DEL; Text has ` A-Z { | } ~ DEL.
  if (text && upper) return [2, t - 64];
  return [2, t - 96];
}

function packTriplets(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3) {
    const v = 1600 * values[i] + 40 * values[i + 1] + values[i + 2] + 1;
    out.push(v >> 8, v & 0xff);
  }
  return out;
}

function asciiCodewords(tokens: readonly DmToken[], i: number): { cws: number[]; consumed: number } {
  const t = tokens[i];
  if (t === 'FNC1') return { cws: [FNC1], consumed: 1 };
  const u = tokens[i + 1];
  if (isDigit(t) && isDigit(u)) return { cws: [130 + (t - 48) * 10 + (u - 48)], consumed: 2 };
  return { cws: t >= 128 ? [UPPER_SHIFT, t - 127] : [t + 1], consumed: 1 };
}

/** 255-state randomisation for Base256 codewords (`pos` is the 1-based codeword position). */
const rand255 = (v: number, pos: number) => (v + ((149 * pos) % 255) + 1) % 256;

type Step = { kind: 'ascii' } | { kind: 'c40' | 'text'; end: number } | { kind: 'b256'; end: number };

/**
 * Fewest codewords for tokens[i..] starting (and ending) in ASCII mode. C40/Text runs are whole
 * triplets followed by an unlatch; Base256 runs carry an explicit length.
 */
export function encodeTokens(tokens: readonly DmToken[], prefix: number[] = [], maxCodewords = Infinity): number[] {
  const n = tokens.length;
  // Values per token, computed once; runs longer than the largest symbol are never useful.
  const c40Len = tokens.map((t) => tripletValues(t, false).length);
  const textLen = tokens.map((t) => tripletValues(t, true).length);
  const cost = Array.from({ length: n + 1 }, (): number => Infinity);
  const step = Array.from({ length: n + 1 }, (): Step | null => null);
  cost[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const a = asciiCodewords(tokens, i);
    cost[i] = a.cws.length + cost[i + a.consumed];
    step[i] = { kind: 'ascii' };
    for (const kind of ['c40', 'text'] as const) {
      const lens = kind === 'text' ? textLen : c40Len;
      let values = 0;
      for (let j = i; j < n; j++) {
        values += lens[j];
        if ((values / 3) * 2 > maxCodewords) break;
        if (values % 3 !== 0) continue;
        const c = 1 + (values / 3) * 2 + 1 + cost[j + 1];
        if (c < cost[i]) {
          cost[i] = c;
          step[i] = { kind, end: j + 1 };
        }
      }
    }
    let bytes = 0;
    for (let j = i; j < n && tokens[j] !== 'FNC1' && bytes < maxCodewords; j++) {
      bytes++;
      const c = 1 + (bytes <= 249 ? 1 : 2) + bytes + cost[j + 1];
      if (c < cost[i]) {
        cost[i] = c;
        step[i] = { kind: 'b256', end: j + 1 };
      }
    }
  }
  const out = [...prefix];
  for (let i = 0; i < n; ) {
    const s = step[i]!;
    if (s.kind === 'ascii') {
      const a = asciiCodewords(tokens, i);
      out.push(...a.cws);
      i += a.consumed;
    } else if (s.kind === 'b256') {
      const len = s.end - i;
      const raw = len <= 249 ? [len] : [Math.floor(len / 250) + 249, len % 250];
      out.push(LATCH_B256);
      for (const v of [...raw, ...(tokens.slice(i, s.end) as number[])]) out.push(rand255(v, out.length + 1));
      i = s.end;
    } else {
      const values = tokens.slice(i, s.end).flatMap((t) => tripletValues(t, s.kind === 'text'));
      out.push(s.kind === 'c40' ? LATCH_C40 : LATCH_TEXT, ...packTriplets(values), UNLATCH);
      i = s.end;
    }
  }
  return out;
}

/** Pads to the symbol's data capacity (129, then 253-state randomised pads). */
export function pad(cws: readonly number[], capacity: number): number[] {
  const out = [...cws];
  if (out.length < capacity) out.push(PAD);
  while (out.length < capacity) {
    const pos = out.length + 1;
    let v = PAD + ((149 * pos) % 253) + 1;
    if (v > 254) v -= 254;
    out.push(v);
  }
  return out;
}

// ---- Module placement (ISO/IEC 16022 Annex F) ----

function placement(codewords: readonly number[], numRows: number, numCols: number): Uint8Array {
  // 2 = unset
  const bits = new Uint8Array(numRows * numCols).fill(2);
  const module = (row: number, col: number, pos: number, bit: number) => {
    if (row < 0) {
      row += numRows;
      col += 4 - ((numRows + 4) % 8);
    }
    if (col < 0) {
      col += numCols;
      row += 4 - ((numCols + 4) % 8);
    }
    bits[row * numCols + col] = (codewords[pos] >> (8 - bit)) & 1;
  };
  const utah = (row: number, col: number, pos: number) => {
    module(row - 2, col - 2, pos, 1);
    module(row - 2, col - 1, pos, 2);
    module(row - 1, col - 2, pos, 3);
    module(row - 1, col - 1, pos, 4);
    module(row - 1, col, pos, 5);
    module(row, col - 2, pos, 6);
    module(row, col - 1, pos, 7);
    module(row, col, pos, 8);
  };
  const corner = (cells: [number, number][], pos: number) => cells.forEach(([r, c], k) => module(r, c, pos, k + 1));
  const R = numRows;
  const C = numCols;
  let pos = 0;
  let row = 4;
  let col = 0;
  do {
    if (row === R && col === 0) {
      corner([[R - 1, 0], [R - 1, 1], [R - 1, 2], [0, C - 2], [0, C - 1], [1, C - 1], [2, C - 1], [3, C - 1]], pos++);
    }
    if (row === R - 2 && col === 0 && C % 4 !== 0) {
      corner([[R - 3, 0], [R - 2, 0], [R - 1, 0], [0, C - 4], [0, C - 3], [0, C - 2], [0, C - 1], [1, C - 1]], pos++);
    }
    if (row === R - 2 && col === 0 && C % 8 === 4) {
      corner([[R - 3, 0], [R - 2, 0], [R - 1, 0], [0, C - 2], [0, C - 1], [1, C - 1], [2, C - 1], [3, C - 1]], pos++);
    }
    if (row === R + 4 && col === 2 && C % 8 === 0) {
      corner([[R - 1, 0], [R - 1, C - 1], [0, C - 3], [0, C - 2], [0, C - 1], [1, C - 3], [1, C - 2], [1, C - 1]], pos++);
    }
    do {
      if (row < R && col >= 0 && bits[row * C + col] === 2) utah(row, col, pos++);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < C);
    row++;
    col += 3;
    do {
      if (row >= 0 && col < C && bits[row * C + col] === 2) utah(row, col, pos++);
      row += 2;
      col -= 2;
    } while (row < R && col >= 0);
    row += 3;
    col++;
  } while (row < R || col < C);
  // Unused bottom-right corner: fixed checker pattern.
  if (bits[R * C - 1] === 2) {
    bits[R * C - 1] = 1;
    bits[(R - 1) * C - 2] = 1;
  }
  for (let i = 0; i < bits.length; i++) if (bits[i] === 2) bits[i] = 0;
  return bits;
}

/** Full symbol with finder (solid L) and timing (alternating) patterns around each data region. */
export function buildMatrix(codewords: readonly number[], size: DmSize): Uint8Array {
  const regionsV = (size.rows - 2 * (size.rows / (size.regionRows + 2))) / size.regionRows;
  const regionsH = (size.cols - 2 * (size.cols / (size.regionCols + 2))) / size.regionCols;
  const dataRows = size.regionRows * regionsV;
  const dataCols = size.regionCols * regionsH;
  const data = placement(codewords, dataRows, dataCols);
  const m = new Uint8Array(size.rows * size.cols);
  const set = (x: number, y: number, v: boolean | number) => (m[y * size.cols + x] = v ? 1 : 0);
  let my = 0;
  for (let y = 0; y < dataRows; y++) {
    if (y % size.regionRows === 0) {
      for (let x = 0; x < size.cols; x++) set(x, my, x % 2 === 0);
      my++;
    }
    let mx = 0;
    for (let x = 0; x < dataCols; x++) {
      if (x % size.regionCols === 0) set(mx++, my, true);
      set(mx++, my, data[y * dataCols + x]);
      if (x % size.regionCols === size.regionCols - 1) set(mx++, my, y % 2 === 0);
    }
    my++;
    if (y % size.regionRows === size.regionRows - 1) {
      for (let x = 0; x < size.cols; x++) set(x, my, true);
      my++;
    }
  }
  return m;
}

export interface DmResult {
  size: DmSize;
  modules: Uint8Array;
  /** Encoded data codewords before padding. */
  used: number;
  codewords: number[];
}

/** Chooses the smallest symbol of the requested shape (or the fixed size) that fits. */
export function encodeDataMatrix(tokens: readonly DmToken[], opts: { shape: DmShape; size: string; eci?: number }): DmResult {
  if (tokens.length === 0) throw new BarcodeError('barcode.error.empty');
  const prefix = opts.eci !== undefined ? [ECI, opts.eci + 1] : [];
  const candidates = DM_SIZES.filter((s) =>
    opts.size !== 'auto' ? dmSizeLabel(s) === opts.size : opts.shape === 'auto' || (opts.shape === 'square') === (s.rows === s.cols),
  );
  const max = candidates.at(-1)?.dataCw ?? 0;
  // At best two digits share a codeword: anything longer cannot fit (and would be slow to try).
  if (tokens.length > max * 2) throw new BarcodeError('barcode.error.dmTooLong', { need: Math.ceil(tokens.length / 2), max });
  const cws = encodeTokens(tokens, prefix, max);
  const size = candidates.find((s) => s.dataCw >= cws.length);
  if (!size) throw new BarcodeError('barcode.error.dmTooLong', { need: cws.length, max });
  const codewords = withEcc(pad(cws, size.dataCw), size);
  return { size, modules: buildMatrix(codewords, size), used: cws.length, codewords };
}

// Aztec Code (ISO/IEC 24778): mode encoding, bit stuffing, Reed-Solomon over GF(2^m), mode
// message, bullseye and reference grid. Compact (1-4 layers) and full-range (1-32 layers).
import { BarcodeError } from './types';

type Mode = 'U' | 'L' | 'M' | 'P' | 'D';

const MIXED = [...'\x00 \x01\x02\x03\x04\x05\x06\x07\b\t\n\x0b\f\r\x1b\x1c\x1d\x1e\x1f@\\^_`|~\x7f'];
// Index 0 is FLG(n) and 2-5 are two-character codes; they are handled separately.
const PUNCT = ['', '\r', '', '', '', '', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '[', ']', '{', '}'];
const PAIRS: Record<string, number> = { '\r\n': 2, '. ': 3, ', ': 4, ': ': 5 };

/** Value of `ch` in `mode`, or -1. */
function code(mode: Mode, ch: number): number {
  const c = String.fromCharCode(ch);
  switch (mode) {
    case 'U':
      return ch === 0x20 ? 1 : ch >= 0x41 && ch <= 0x5a ? ch - 0x41 + 2 : -1;
    case 'L':
      return ch === 0x20 ? 1 : ch >= 0x61 && ch <= 0x7a ? ch - 0x61 + 2 : -1;
    case 'D':
      return ch === 0x20 ? 1 : ch >= 0x30 && ch <= 0x39 ? ch - 0x30 + 2 : c === ',' ? 12 : c === '.' ? 13 : -1;
    case 'M': {
      const i = MIXED.indexOf(c);
      return i > 0 ? i : -1;
    }
    case 'P': {
      const i = PUNCT.indexOf(c);
      return i > 0 && PUNCT[i] !== '' ? i : -1;
    }
  }
}

const bitsOf = (mode: Mode) => (mode === 'D' ? 4 : 5);

/** Latch sequences as [value, bits] pairs (ISO/IEC 24778 Table 3). */
const LATCH: Record<Mode, Partial<Record<Mode, [number, number][]>>> = {
  U: { L: [[28, 5]], M: [[29, 5]], D: [[30, 5]], P: [[29, 5], [30, 5]] },
  L: { U: [[30, 5], [14, 4]], M: [[29, 5]], D: [[30, 5]], P: [[29, 5], [30, 5]] },
  M: { U: [[29, 5]], L: [[28, 5]], D: [[29, 5], [30, 5]], P: [[30, 5]] },
  P: { U: [[31, 5]], L: [[31, 5], [28, 5]], M: [[31, 5], [29, 5]], D: [[31, 5], [30, 5]] },
  D: { U: [[14, 4]], L: [[14, 4], [28, 5]], M: [[14, 4], [29, 5]], P: [[14, 4], [29, 5], [30, 5]] },
};

class Bits {
  bits: number[] = [];
  push(value: number, n: number): void {
    for (let i = n - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
}

const TEXT_MODES: Mode[] = ['U', 'L', 'M', 'D', 'P'];

function latchCost(from: Mode, to: Mode): number {
  return from === to ? 0 : LATCH[from][to]!.reduce((n, [, b]) => n + b, 0);
}

/** Mode that can encode `ch` most cheaply from `from` by latching. */
function bestLatch(from: Mode, ch: number): Mode | null {
  let best: Mode | null = null;
  for (const m of TEXT_MODES) {
    if (code(m, ch) < 0) continue;
    if (!best || latchCost(from, m) + bitsOf(m) < latchCost(from, best) + bitsOf(best)) best = m;
  }
  return best;
}

function encodable(ch: number): boolean {
  return TEXT_MODES.some((m) => code(m, ch) >= 0);
}

/**
 * Greedy high-level encoding: stays in the current mode while possible, uses shifts for single
 * characters (U/S, P/S), latches otherwise, and binary shift for bytes no mode can encode.
 */
export function aztecBits(bytes: readonly number[], eci?: number): number[] {
  const out = new Bits();
  // Changed inside latch(), so TypeScript must not narrow it to 'U'.
  let mode = 'U' as Mode;
  const latch = (to: Mode) => {
    for (const [v, n] of LATCH[mode][to] ?? []) out.push(v, n);
    mode = to;
  };

  if (eci !== undefined) {
    // P/S FLG(n): n digits of the ECI number, each as digit + 2 in 4 bits.
    const digits = String(eci);
    out.push(0, 5);
    out.push(0, 5);
    out.push(digits.length, 3);
    for (const d of digits) out.push(Number(d) + 2, 4);
  }

  for (let i = 0; i < bytes.length; ) {
    const ch = bytes[i];
    const pair = i + 1 < bytes.length ? PAIRS[String.fromCharCode(ch, bytes[i + 1])] : undefined;
    if (pair !== undefined && mode !== 'D') {
      // Punctuation pairs save 5 bits whenever they are reachable by shift or already latched.
      if (mode !== 'P') out.push(0, 5);
      out.push(pair, 5);
      i += 2;
      continue;
    }
    const here = code(mode, ch);
    if (here >= 0) {
      out.push(here, bitsOf(mode));
      i++;
      continue;
    }
    if (!encodable(ch)) {
      // Binary shift is available from U, L and M.
      if (mode === 'D' || mode === 'P') latch('U');
      let n = 1;
      while (i + n < bytes.length && n < 2078 && !encodable(bytes[i + n])) n++;
      out.push(31, 5);
      if (n <= 31) out.push(n, 5);
      else {
        out.push(0, 5);
        out.push(n - 31, 11);
      }
      for (let j = 0; j < n; j++) out.push(bytes[i + j], 8);
      i += n;
      continue;
    }
    const next = i + 1 < bytes.length ? bytes[i + 1] : -1;
    const p = code('P', ch);
    if (p >= 0 && mode !== 'P' && !(next >= 0 && code('P', next) >= 0 && code(mode, next) < 0)) {
      out.push(0, bitsOf(mode)); // P/S
      out.push(p, 5);
      i++;
      continue;
    }
    const u = code('U', ch);
    if (u >= 0 && (mode === 'L' || mode === 'D') && next >= 0 && code(mode, next) >= 0 && code('U', next) < 0) {
      out.push(mode === 'L' ? 28 : 15, bitsOf(mode)); // U/S
      out.push(u, 5);
      i++;
      continue;
    }
    latch(bestLatch(mode, ch)!);
  }
  return out.bits;
}

// Reed-Solomon over GF(2^m), generator roots alpha^1 .. alpha^k.
const PRIMITIVE: Record<number, number> = { 4: 0x13, 6: 0x43, 8: 0x12d, 10: 0x409, 12: 0x1069 };

interface Field {
  exp: Uint16Array;
  log: Uint16Array;
  size: number;
}
const fields = new Map<number, Field>();
function field(m: number): Field {
  let f = fields.get(m);
  if (f) return f;
  const size = 1 << m;
  const exp = new Uint16Array(size * 2);
  const log = new Uint16Array(size);
  let x = 1;
  for (let i = 0; i < size - 1; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & size) x ^= PRIMITIVE[m];
  }
  for (let i = size - 1; i < size * 2; i++) exp[i] = exp[i - (size - 1)];
  f = { exp, log, size };
  fields.set(m, f);
  return f;
}

function mul(f: Field, a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : f.exp[f.log[a] + f.log[b]];
}

/** Appends `k` check words to `data` (words of `m` bits). */
export function rsEncode(data: readonly number[], k: number, m: number): number[] {
  const f = field(m);
  let g = [1];
  for (let i = 1; i <= k; i++) {
    const root = f.exp[i];
    const next: number[] = Array.from({ length: g.length + 1 }, () => 0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(f, g[j], root);
    }
    g = next;
  }
  const ecc = Array.from({ length: k }, () => 0);
  for (const d of data) {
    const t = d ^ ecc[0];
    for (let j = 0; j < k - 1; j++) ecc[j] = ecc[j + 1] ^ mul(f, t, g[j + 1]);
    ecc[k - 1] = mul(f, t, g[k]);
  }
  return [...data, ...ecc];
}

const wordSize = (layers: number) => (layers <= 2 ? 6 : layers <= 8 ? 8 : layers <= 22 ? 10 : 12);
const totalBits = (layers: number, compact: boolean) => ((compact ? 88 : 112) + 16 * layers) * layers;

/** Splits bits into words, stuffing a bit into words that would be all 0s or all 1s. */
export function stuffBits(bits: readonly number[], w: number): number[] {
  const words: number[] = [];
  const mask = (1 << w) - 2;
  for (let i = 0; i < bits.length; i += w) {
    let word = 0;
    for (let j = 0; j < w; j++) if (i + j >= bits.length || bits[i + j]) word |= 1 << (w - 1 - j);
    if ((word & mask) === mask) {
      words.push(word & mask);
      i--;
    } else if ((word & mask) === 0) {
      words.push(word | 1);
      i--;
    } else words.push(word);
  }
  return words;
}

export interface AztecLayout {
  compact: boolean;
  layers: number;
}

export interface AztecResult extends AztecLayout {
  size: number;
  modules: Uint8Array;
  /** Data words used and available (at the requested error correction). */
  dataWords: number;
  capacityWords: number;
}

/** Smallest symbol that fits `bits` with at least `eccPercent` of check words (plus 3 words). */
export function chooseAztecLayout(bits: readonly number[], eccPercent: number): AztecLayout & { words: number[] } {
  const candidates: AztecLayout[] = [
    ...[1, 2, 3, 4].map((layers) => ({ compact: true, layers })),
    ...Array.from({ length: 29 }, (_, i) => ({ compact: false, layers: i + 4 })),
  ];
  const eccBits = Math.floor((bits.length * eccPercent) / 100) + 11;
  for (const c of candidates) {
    const total = totalBits(c.layers, c.compact);
    if (bits.length + eccBits > total) continue;
    const w = wordSize(c.layers);
    const words = stuffBits(bits, w);
    const usable = total - (total % w);
    if (c.compact && words.length > 64) continue;
    if (words.length * w + eccBits <= usable) return { ...c, words };
  }
  throw new BarcodeError('barcode.error.aztecTooLong');
}

function modeMessage(layout: AztecLayout, dataWords: number): number[] {
  const b = new Bits();
  if (layout.compact) {
    b.push(layout.layers - 1, 2);
    b.push(dataWords - 1, 6);
  } else {
    b.push(layout.layers - 1, 5);
    b.push(dataWords - 1, 11);
  }
  const words: number[] = [];
  for (let i = 0; i < b.bits.length; i += 4) words.push(b.bits.slice(i, i + 4).reduce((a, x) => (a << 1) | x, 0));
  const out = new Bits();
  for (const w of rsEncode(words, layout.compact ? 5 : 6, 4)) out.push(w, 4);
  return out.bits;
}

/** Builds the symbol from stuffed data words. */
export function buildAztec(dataWords: readonly number[], layout: AztecLayout): AztecResult {
  const { compact, layers } = layout;
  const w = wordSize(layers);
  const total = totalBits(layers, compact);
  const totalWords = Math.floor(total / w);
  // At least one check word, and the mode message can count at most 64 (compact) data words.
  if (dataWords.length >= totalWords || (compact && dataWords.length > 64)) throw new BarcodeError('barcode.error.aztecTooLong');
  const message = new Bits();
  message.push(0, total % w);
  for (const word of rsEncode(dataWords, totalWords - dataWords.length, w)) message.push(word, w);
  const bits = message.bits;

  const base = (compact ? 11 : 14) + layers * 4;
  const map = Array.from({ length: base }, () => 0);
  let size: number;
  if (compact) {
    size = base;
    for (let i = 0; i < base; i++) map[i] = i;
  } else {
    size = base + 1 + 2 * Math.floor((Math.floor(base / 2) - 1) / 15);
    const orig = Math.floor(base / 2);
    const center = Math.floor(size / 2);
    for (let i = 0; i < orig; i++) {
      const offset = i + Math.floor(i / 15);
      map[orig - i - 1] = center - offset - 1;
      map[orig + i] = center + offset + 1;
    }
  }
  const modules = new Uint8Array(size * size);
  const set = (x: number, y: number) => (modules[y * size + x] = 1);

  let rowOffset = 0;
  for (let i = 0; i < layers; i++) {
    const rowSize = (layers - i) * 4 + (compact ? 9 : 12);
    for (let j = 0; j < rowSize; j++) {
      const col = j * 2;
      for (let k = 0; k < 2; k++) {
        if (bits[rowOffset + col + k]) set(map[i * 2 + k], map[i * 2 + j]);
        if (bits[rowOffset + rowSize * 2 + col + k]) set(map[i * 2 + j], map[base - 1 - i * 2 - k]);
        if (bits[rowOffset + rowSize * 4 + col + k]) set(map[base - 1 - i * 2 - k], map[base - 1 - i * 2 - j]);
        if (bits[rowOffset + rowSize * 6 + col + k]) set(map[base - 1 - i * 2 - j], map[i * 2 + k]);
      }
    }
    rowOffset += rowSize * 8;
  }

  const center = Math.floor(size / 2);
  const mode = modeMessage(layout, dataWords.length);
  if (compact) {
    for (let i = 0; i < 7; i++) {
      const o = center - 3 + i;
      if (mode[i]) set(o, center - 5);
      if (mode[i + 7]) set(center + 5, o);
      if (mode[20 - i]) set(o, center + 5);
      if (mode[27 - i]) set(center - 5, o);
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const o = center - 5 + i + Math.floor(i / 5);
      if (mode[i]) set(o, center - 7);
      if (mode[i + 10]) set(center + 7, o);
      if (mode[29 - i]) set(o, center + 7);
      if (mode[39 - i]) set(center - 7, o);
    }
  }

  // Bullseye (dark rings every other module) and orientation marks.
  const eye = compact ? 5 : 7;
  for (let i = 0; i < eye; i += 2) {
    for (let j = center - i; j <= center + i; j++) {
      set(j, center - i);
      set(j, center + i);
      set(center - i, j);
      set(center + i, j);
    }
  }
  set(center - eye, center - eye);
  set(center - eye + 1, center - eye);
  set(center - eye, center - eye + 1);
  set(center + eye, center - eye);
  set(center + eye, center - eye + 1);
  set(center + eye, center + eye - 1);

  // Full-range reference grid: lines every 16 modules from the centre, alternating modules.
  if (!compact) {
    for (let i = 0, j = 0; i < Math.floor(base / 2) - 1; i += 15, j += 16) {
      for (let k = center & 1; k < size; k += 2) {
        set(center - j, k);
        set(center + j, k);
        set(k, center - j);
        set(k, center + j);
      }
    }
  }

  return { compact, layers, size, modules, dataWords: dataWords.length, capacityWords: totalWords };
}

export function encodeAztec(bytes: readonly number[], opts: { eccPercent: number; eci?: number }): AztecResult {
  const bits = aztecBits(bytes, opts.eci);
  const { words, ...layout } = chooseAztecLayout(bits, opts.eccPercent);
  return buildAztec(words, layout);
}

export const aztecSizeLabel = (r: AztecLayout & { size: number }) => `${r.compact ? 'Compact' : 'Full'} ${r.layers}L ${r.size}×${r.size}`;

// Code 128 (ISO/IEC 15417) and GS1-128. The automatic mode picks the shortest codeword
// sequence over code sets A/B/C (including SHIFT) with dynamic programming.
import { BarcodeError, digitsOf } from './types';

const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const SHIFT = 98;
const CODE_C = 99;
const CODE_B = 100;
const CODE_A = 101;
const FNC1 = 102;
const START = { A: 103, B: 104, C: 105 } as const;
const STOP = 106;

type CodeSet = 'A' | 'B' | 'C';
/** Input token: an ASCII code (0-127) or FNC1. */
export type Token = number | 'FNC1';

const inA = (c: number) => c < 96;
const inB = (c: number) => c >= 32 && c < 128;
const valueA = (c: number) => (c < 32 ? c + 64 : c - 32);
const valueB = (c: number) => c - 32;
const isDigit = (t: Token | undefined): t is number => typeof t === 'number' && t >= 48 && t <= 57;
const SWITCH: Record<CodeSet, Record<CodeSet, number>> = {
  A: { A: -1, B: CODE_B, C: CODE_C },
  B: { A: CODE_A, B: -1, C: CODE_C },
  C: { A: CODE_A, B: CODE_B, C: -1 },
};

interface Step {
  /** Codewords emitted for this step. */
  cws: number[];
  consumed: number;
  next: CodeSet;
}

/** Ways to encode the token(s) at `i` while staying in `set` (no set change). */
function directSteps(tokens: readonly Token[], i: number, set: CodeSet): Step[] {
  const t = tokens[i];
  if (t === 'FNC1') return [{ cws: [FNC1], consumed: 1, next: set }];
  if (set === 'C') {
    const u = tokens[i + 1];
    return isDigit(t) && isDigit(u) ? [{ cws: [(t - 48) * 10 + (u - 48)], consumed: 2, next: 'C' }] : [];
  }
  if (set === 'A') {
    if (inA(t)) return [{ cws: [valueA(t)], consumed: 1, next: 'A' }];
    return inB(t) ? [{ cws: [SHIFT, valueB(t)], consumed: 1, next: 'A' }] : [];
  }
  if (inB(t)) return [{ cws: [valueB(t)], consumed: 1, next: 'B' }];
  return inA(t) ? [{ cws: [SHIFT, valueA(t)], consumed: 1, next: 'B' }] : [];
}

/** Shortest codeword sequence (without start/check/stop); `only` forces a single code set. */
export function code128Codewords(tokens: readonly Token[], only?: CodeSet): { start: CodeSet; cws: number[] } {
  const n = tokens.length;
  const sets: CodeSet[] = only ? [only] : ['B', 'C', 'A'];
  // cost[i][s]: fewest codewords for tokens[i..] when currently in set s.
  const cost = Array.from({ length: n + 1 }, () => ({ A: Infinity, B: Infinity, C: Infinity }));
  const choice: Record<CodeSet, { step: Step; switchTo: CodeSet | null } | null>[] = Array.from({ length: n + 1 }, () => ({
    A: null,
    B: null,
    C: null,
  }));
  cost[n] = { A: 0, B: 0, C: 0 };
  for (let i = n - 1; i >= 0; i--) {
    const direct = { A: Infinity, B: Infinity, C: Infinity };
    const directStep: Record<CodeSet, Step | null> = { A: null, B: null, C: null };
    for (const s of sets) {
      for (const st of directSteps(tokens, i, s)) {
        const c = st.cws.length + cost[i + st.consumed][st.next];
        if (c < direct[s]) {
          direct[s] = c;
          directStep[s] = st;
        }
      }
    }
    for (const s of sets) {
      cost[i][s] = direct[s];
      choice[i][s] = directStep[s] ? { step: directStep[s], switchTo: null } : null;
      for (const o of sets) {
        if (o === s || !directStep[o] || 1 + direct[o] >= cost[i][s]) continue;
        cost[i][s] = 1 + direct[o];
        choice[i][s] = { step: directStep[o], switchTo: o };
      }
    }
  }
  let start: CodeSet | null = null;
  for (const s of sets) if (cost[0][s] < Infinity && (start === null || cost[0][s] < cost[0][start])) start = s;
  if (start === null) throw new BarcodeError('barcode.error.chars');
  const cws: number[] = [];
  let set: CodeSet = start;
  for (let i = 0; i < n; ) {
    const c = choice[i][set];
    if (!c) throw new BarcodeError('barcode.error.chars');
    if (c.switchTo) {
      cws.push(SWITCH[set][c.switchTo]);
      set = c.switchTo;
    }
    cws.push(...c.step.cws);
    i += c.step.consumed;
    set = c.step.next;
  }
  return { start, cws };
}

/** Full bar/space widths including start, check and stop. */
export function code128Widths(tokens: readonly Token[], only?: CodeSet): { widths: number[]; codewords: number } {
  if (tokens.length === 0) throw new BarcodeError('barcode.error.empty');
  const { start, cws } = code128Codewords(tokens, only);
  const all = [START[start], ...cws];
  const check = all.reduce((sum, v, i) => sum + v * Math.max(1, i), 0) % 103;
  all.push(check, STOP);
  return { widths: all.flatMap((v) => digitsOf(PATTERNS[v])), codewords: all.length };
}

/** Converts text to tokens; characters outside ASCII are rejected. */
export function textTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c > 127) throw new BarcodeError('barcode.error.charAt', { char: ch });
    out.push(c);
  }
  return out;
}

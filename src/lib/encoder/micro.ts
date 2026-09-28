import { Matrix, MASKS, bchFormat } from './matrix';
import { microSymbolNumber, type SymbolSpec } from './symbols';

/** Micro QR masks 0-3 correspond to Model 2 masks 1, 4, 6, 7. */
const MICRO_MASKS = [1, 4, 6, 7].map((i) => MASKS[i]);

function functionPatterns(size: number): Matrix {
  const m = new Matrix(size, size);
  for (let y = 0; y <= 7; y++) {
    for (let x = 0; x <= 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      m.setFunction(x, y, d !== 2 && d < 4);
    }
  }
  for (let i = 8; i < size; i++) {
    m.setFunction(i, 0, i % 2 === 0);
    m.setFunction(0, i, i % 2 === 0);
  }
  // Reserve format information area.
  for (let i = 1; i <= 8; i++) {
    m.setFunction(i, 8, false);
    m.setFunction(8, i, false);
  }
  return m;
}

function drawFormat(m: Matrix, spec: SymbolSpec, mask: number): void {
  const bits = bchFormat((microSymbolNumber(spec) << 2) | mask) ^ 0x4445;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  // Bits 14..7 along row 8 (x = 1..8), bits 6..0 up column 8 (y = 7..1).
  for (let x = 1; x <= 8; x++) m.setFunction(x, 8, bit(15 - x));
  for (let y = 7; y >= 1; y--) m.setFunction(8, y, bit(y - 1));
}

function score(m: Matrix): number {
  const last = m.width - 1;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 1; i <= last; i++) {
    sum1 += m.get(last, i) ? 1 : 0;
    sum2 += m.get(i, last) ? 1 : 0;
  }
  return sum1 <= sum2 ? sum1 * 16 + sum2 : sum2 * 16 + sum1;
}

export function buildMicro(spec: SymbolSpec, bits: ArrayLike<number>, mask: number | 'auto'): { matrix: Matrix; mask: number } {
  const base = functionPatterns(spec.width);
  base.placeZigzag(bits, spec.width - 1);
  const candidates = mask === 'auto' ? [0, 1, 2, 3] : [mask];
  let best: { matrix: Matrix; mask: number; score: number } | null = null;
  for (const mk of candidates) {
    const m = base.clone();
    m.applyMask(MICRO_MASKS[mk]);
    drawFormat(m, spec, mk);
    const s = score(m);
    if (!best || s > best.score) best = { matrix: m, mask: mk, score: s };
  }
  return { matrix: best!.matrix, mask: best!.mask };
}

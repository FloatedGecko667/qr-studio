import { Matrix, MASKS, bchFormat } from './matrix';
import { MODEL2_ALIGN } from './specTables';
import type { SymbolSpec } from './symbols';

const EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 } as const;

function drawFinder(m: Matrix, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      m.setFunction(x, y, d !== 2 && d !== 4);
    }
  }
}

function drawAlignment(m: Matrix, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) m.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
}

function drawFormat(m: Matrix, spec: SymbolSpec, mask: number): void {
  const bits = bchFormat((EC_FORMAT_BITS[spec.ecLevel] << 3) | mask) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const size = m.width;
  for (let i = 0; i <= 5; i++) m.setFunction(8, i, bit(i));
  m.setFunction(8, 7, bit(6));
  m.setFunction(8, 8, bit(7));
  m.setFunction(7, 8, bit(8));
  for (let i = 9; i < 15; i++) m.setFunction(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) m.setFunction(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) m.setFunction(8, size - 15 + i, bit(i));
  m.setFunction(8, size - 8, true); // dark module
}

function drawVersion(m: Matrix, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = m.width - 11 + (i % 3);
    const b = Math.floor(i / 3);
    m.setFunction(a, b, dark);
    m.setFunction(b, a, dark);
  }
}

function functionPatterns(spec: SymbolSpec): Matrix {
  const size = spec.width;
  const m = new Matrix(size, size);
  for (let i = 0; i < size; i++) {
    m.setFunction(6, i, i % 2 === 0);
    m.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(m, 3, 3);
  drawFinder(m, size - 4, 3);
  drawFinder(m, 3, size - 4);
  const align = MODEL2_ALIGN[spec.version - 1];
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      drawAlignment(m, align[i], align[j]);
    }
  }
  drawFormat(m, spec, 0); // reserve; redrawn per mask
  drawVersion(m, spec.version);
  return m;
}

// --- Mask penalty (ISO/IEC 18004 7.8.3) ---

function penalty(m: Matrix): number {
  const size = m.width;
  let result = 0;
  const lineScore = (get: (i: number) => boolean): number => {
    let score = 0;
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    const addHistory = (len: number) => {
      if (history[0] === 0) len += size; // light border before the line
      history.pop();
      history.unshift(len);
    };
    const countFinder = (): number => {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };
    for (let i = 0; i < size; i++) {
      const c = get(i);
      if (c === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score++;
      } else {
        addHistory(runLen);
        if (!runColor) score += countFinder() * 40;
        runColor = c;
        runLen = 1;
      }
    }
    if (runColor) {
      addHistory(runLen);
      runLen = 0;
    }
    runLen += size;
    addHistory(runLen);
    return score + countFinder() * 40;
  };
  for (let y = 0; y < size; y++) result += lineScore((x) => m.get(x, y));
  for (let x = 0; x < size; x++) result += lineScore((y) => m.get(x, y));
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m.get(x, y);
      if (c === m.get(x + 1, y) && c === m.get(x, y + 1) && c === m.get(x + 1, y + 1)) result += 3;
    }
  }
  let dark = 0;
  for (const v of m.modules) dark += v;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * 10;
}

export function buildModel2(spec: SymbolSpec, bits: ArrayLike<number>, mask: number | 'auto'): { matrix: Matrix; mask: number } {
  const base = functionPatterns(spec);
  base.placeZigzag(bits, spec.width - 1, 6);
  const candidates = mask === 'auto' ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask];
  let best: { matrix: Matrix; mask: number; score: number } | null = null;
  for (const mk of candidates) {
    const m = base.clone();
    m.applyMask(MASKS[mk]);
    drawFormat(m, spec, mk);
    const score = candidates.length > 1 ? penalty(m) : 0;
    if (!best || score < best.score) best = { matrix: m, mask: mk, score };
  }
  return { matrix: best!.matrix, mask: best!.mask };
}

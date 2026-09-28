import { Matrix, MASKS } from './matrix';
import { RMQR_SPECS } from './specTables';
import type { SymbolSpec } from './symbols';

/**
 * Masked format information sequences, ISO/IEC 23941:2022 Annex C Table C.1,
 * indexed by (ecLevel H ? 32 : 0) + version indicator.
 */
const FORMAT_FINDER_SIDE = [
  0x1fab2, 0x1e597, 0x1dbdd, 0x1c4f8, 0x1b86c, 0x1a749, 0x19903, 0x18626, 0x17f0e, 0x1602b, 0x15e61, 0x14144,
  0x13dd0, 0x122f5, 0x11cbf, 0x1039a, 0x0f1ca, 0x0eeef, 0x0d0a5, 0x0cf80, 0x0b314, 0x0ac31, 0x0927b, 0x08d5e,
  0x07476, 0x06b53, 0x05519, 0x04a3c, 0x036a8, 0x0298d, 0x017c7, 0x008e2, 0x3f367, 0x3ec42, 0x3d208, 0x3cd2d,
  0x3b1b9, 0x3ae9c, 0x390d6, 0x38ff3, 0x376db, 0x369fe, 0x357b4, 0x34891, 0x33405, 0x32b20, 0x3156a, 0x30a4f,
  0x2f81f, 0x2e73a, 0x2d970, 0x2c655, 0x2bac1, 0x2a5e4, 0x29bae, 0x2848b, 0x27da3, 0x26286, 0x25ccc, 0x243e9,
  0x23f7d, 0x22058, 0x21e12, 0x20137,
];
const FORMAT_SUB_SIDE = [
  0x20a7b, 0x2155e, 0x22b14, 0x23431, 0x248a5, 0x25780, 0x269ca, 0x276ef, 0x28fc7, 0x290e2, 0x2aea8, 0x2b18d,
  0x2cd19, 0x2d23c, 0x2ec76, 0x2f353, 0x30103, 0x31e26, 0x3206c, 0x33f49, 0x343dd, 0x35cf8, 0x362b2, 0x37d97,
  0x384bf, 0x39b9a, 0x3a5d0, 0x3baf5, 0x3c661, 0x3d944, 0x3e70e, 0x3f82b, 0x003ae, 0x01c8b, 0x022c1, 0x03de4,
  0x04170, 0x05e55, 0x0601f, 0x07f3a, 0x08612, 0x09937, 0x0a77d, 0x0b858, 0x0c4cc, 0x0dbe9, 0x0e5a3, 0x0fa86,
  0x108d6, 0x117f3, 0x129b9, 0x1369c, 0x14a08, 0x1552d, 0x16b67, 0x17442, 0x18d6a, 0x1924f, 0x1ac05, 0x1b320,
  0x1cfb4, 0x1d091, 0x1eedb, 0x1f1fe,
];

function functionPatterns(spec: SymbolSpec): Matrix {
  const { width: w, height: h } = spec;
  const m = new Matrix(w, h);
  const set = (x: number, y: number, dark: boolean) => m.setFunction(x, y, dark);

  // Finder pattern (top-left) with separator.
  for (let y = 0; y < Math.min(8, h); y++) {
    for (let x = 0; x <= 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      set(x, y, d !== 2 && d < 4);
    }
  }
  // Finder sub-pattern (bottom-right).
  for (let dy = 0; dy < 5; dy++) {
    for (let dx = 0; dx < 5; dx++) {
      const d = Math.max(Math.abs(dx - 2), Math.abs(dy - 2));
      set(w - 5 + dx, h - 5 + dy, d !== 1);
    }
  }
  // Corner finder patterns.
  set(0, h - 1, true);
  set(1, h - 1, true);
  set(2, h - 1, true);
  if (h >= 11) {
    set(0, h - 2, true);
    set(1, h - 2, false);
  }
  set(w - 1, 0, true);
  set(w - 2, 0, true);
  set(w - 1, 1, true);
  set(w - 2, 1, false);
  // Alignment patterns (top and bottom edge).
  const align = RMQR_SPECS[spec.version].align;
  for (const cx of align) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dark = i !== 1 || j !== 1;
        set(cx + j - 1, i, dark);
        set(cx + j - 1, h - 1 - i, dark);
      }
    }
  }
  // Timing patterns fill whatever is still free on the edges and alignment columns.
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) if (!m.isFn(x, y)) set(x, y, x % 2 === 0);
  }
  for (const x of [0, w - 1, ...align]) {
    for (let y = 0; y < h; y++) if (!m.isFn(x, y)) set(x, y, y % 2 === 0);
  }
  drawFormat(m, spec);
  return m;
}

function drawFormat(m: Matrix, spec: SymbolSpec): void {
  const { width: w, height: h } = spec;
  const idx = (spec.ecLevel === 'H' ? 32 : 0) + spec.version;
  const a = FORMAT_FINDER_SIDE[idx];
  const b = FORMAT_SUB_SIDE[idx];
  const bit = (v: number, n: number) => ((v >>> n) & 1) === 1;
  for (let n = 0; n < 15; n++) {
    m.setFunction(8 + Math.floor(n / 5), 1 + (n % 5), bit(a, n));
    m.setFunction(w - 8 + Math.floor(n / 5), h - 6 + (n % 5), bit(b, n));
  }
  for (let n = 15; n < 18; n++) {
    m.setFunction(11, 1 + n - 15, bit(a, n));
    m.setFunction(w - 5 + n - 15, h - 6, bit(b, n));
  }
}

export function buildRmqr(spec: SymbolSpec, bits: ArrayLike<number>): { matrix: Matrix; mask: number } {
  const m = functionPatterns(spec);
  m.placeZigzag(bits, spec.width - 2);
  m.applyMask(MASKS[4]);
  return { matrix: m, mask: 4 };
}

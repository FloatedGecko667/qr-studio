// Codabar / NW-7 (two-width, 4 bars + 3 spaces per character, narrow gap between characters).
import { BarcodeError, type CodabarGuard } from './types';

/** 7-bit element patterns (1 = wide), bar first. */
const PATTERNS: Record<string, number> = {
  '0': 0b0000011, '1': 0b0000110, '2': 0b0001001, '3': 0b1100000, '4': 0b0010010,
  '5': 0b1000010, '6': 0b0100001, '7': 0b0100100, '8': 0b0110000, '9': 0b1001000,
  '-': 0b0001100, $: 0b0011000, ':': 0b1000101, '/': 0b1010001, '.': 0b1010100, '+': 0b0010101,
  A: 0b0011010, B: 0b0101001, C: 0b0001011, D: 0b0001110,
};
const GUARDS = 'ABCD';

/**
 * `text` may include its own start/stop characters (A–D, also accepted as T N * E); otherwise
 * the configured ones are added. Returns the full character string and widths.
 */
export function codabar(text: string, opts: { start: CodabarGuard; stop: CodabarGuard; wideRatio: number }): { data: string; widths: number[] } {
  const alias = (c: string | undefined) => (c ? ({ T: 'A', N: 'B', '*': 'C', E: 'D' } as Record<string, string>)[c] ?? c : '');
  const upper = text.toUpperCase();
  let t = upper.length > 1 ? alias(upper[0]) + upper.slice(1, -1) + alias(upper.at(-1)) : upper;
  if (t.length === 0) throw new BarcodeError('barcode.error.empty');
  const hasStart = GUARDS.includes(t[0]);
  const hasStop = t.length > 1 && GUARDS.includes(t.at(-1)!);
  if (hasStart !== hasStop) throw new BarcodeError('barcode.error.codabarGuards');
  if (!hasStart) t = opts.start + t + opts.stop;
  const body = t.slice(1, -1);
  if (body.length === 0) throw new BarcodeError('barcode.error.empty');
  for (const ch of body) {
    if (!(ch in PATTERNS) || GUARDS.includes(ch)) throw new BarcodeError('barcode.error.charAt', { char: ch });
  }
  const widths: number[] = [];
  Array.from(t).forEach((ch, i) => {
    if (i > 0) widths.push(1);
    for (let bit = 6; bit >= 0; bit--) widths.push((PATTERNS[ch] >> bit) & 1 ? opts.wideRatio : 1);
  });
  return { data: t, widths };
}

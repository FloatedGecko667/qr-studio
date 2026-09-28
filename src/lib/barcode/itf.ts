// Interleaved 2 of 5 (ISO/IEC 16390) and ITF-14.
import { digitsOnly, gs1CheckDigit } from './checksum';
import { BarcodeError } from './types';

/** 5-element patterns, 1 = wide. */
const PATTERNS = ['00110', '10001', '01001', '11000', '00101', '10100', '01100', '00011', '10010', '01010'];

export function itfWidths(digits: string, wide: number): number[] {
  const w = (bit: string) => (bit === '1' ? wide : 1);
  const out = [1, 1, 1, 1];
  for (let i = 0; i < digits.length; i += 2) {
    const bars = PATTERNS[Number(digits[i])];
    const spaces = PATTERNS[Number(digits[i + 1])];
    for (let k = 0; k < 5; k++) out.push(w(bars[k]), w(spaces[k]));
  }
  out.push(wide, 1, 1);
  return out;
}

function parseDigits(value: string): string {
  const d = digitsOnly(value);
  if (d.length === 0) throw new BarcodeError('barcode.error.empty');
  if (!/^\d+$/.test(d)) throw new BarcodeError('barcode.error.digitsOnly');
  return d;
}

/** ITF needs an even number of digits (including the optional mod 10 check digit). */
export function itf(value: string, checkDigit: boolean): string {
  const d = parseDigits(value);
  const all = checkDigit ? d + gs1CheckDigit(d) : d;
  if (all.length % 2) throw new BarcodeError(checkDigit ? 'barcode.error.itfOddWithCheck' : 'barcode.error.itfOdd');
  return all;
}

/** ITF-14: 13 digits (check digit added) or 14 digits (verified). */
export function itf14(value: string): string {
  const d = parseDigits(value);
  if (d.length === 13) return d + gs1CheckDigit(d);
  if (d.length === 14) {
    const expected = gs1CheckDigit(d.slice(0, 13));
    if (Number(d[13]) !== expected) throw new BarcodeError('barcode.error.checkDigit', { expected });
    return d;
  }
  throw new BarcodeError('barcode.error.length', { lengths: '13 / 14' });
}

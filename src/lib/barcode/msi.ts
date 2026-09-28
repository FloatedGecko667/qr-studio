// MSI (Modified Plessey) and Pharmacode (one-track).
import { digitsOnly, luhnCheckDigit, msiMod11 } from './checksum';
import { BarcodeError, type MsiCheck } from './types';

export function msiData(value: string, check: MsiCheck): string {
  const d = digitsOnly(value);
  if (d.length === 0) throw new BarcodeError('barcode.error.empty');
  if (!/^\d+$/.test(d)) throw new BarcodeError('barcode.error.digitsOnly');
  if (check === 'mod10') return d + luhnCheckDigit(d);
  if (check === 'mod1010') {
    const once = d + luhnCheckDigit(d);
    return once + luhnCheckDigit(once);
  }
  if (check === 'mod11') return d + msiMod11(d);
  if (check === 'mod1110') {
    const once = d + msiMod11(d);
    return once + luhnCheckDigit(once);
  }
  return d;
}

/** Each digit is 4 bits (MSB first): 1 = wide bar + narrow space, 0 = narrow bar + wide space. */
export function msiWidths(data: string): number[] {
  const out = [2, 1];
  for (const ch of data) {
    const v = Number(ch);
    for (let bit = 3; bit >= 0; bit--) out.push(...((v >> bit) & 1 ? [2, 1] : [1, 2]));
  }
  out.push(1, 2, 1);
  return out;
}

export const PHARMACODE_RANGE = [3, 131070] as const;

/** Narrow bar = 1, wide bar = 3, space = 2 modules. */
export function pharmacodeWidths(value: string): number[] {
  const d = digitsOnly(value);
  if (!/^\d+$/.test(d)) throw new BarcodeError('barcode.error.digitsOnly');
  let n = Number(d);
  if (n < PHARMACODE_RANGE[0] || n > PHARMACODE_RANGE[1]) {
    throw new BarcodeError('barcode.error.range', { min: PHARMACODE_RANGE[0], max: PHARMACODE_RANGE[1] });
  }
  const bars: number[] = [];
  while (n > 0) {
    if (n % 2 === 0) {
      bars.unshift(3);
      n = (n - 2) / 2;
    } else {
      bars.unshift(1);
      n = (n - 1) / 2;
    }
  }
  return bars.flatMap((b, i) => (i === 0 ? [b] : [2, b]));
}

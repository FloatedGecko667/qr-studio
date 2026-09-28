// Code 39 (ISO/IEC 16388) and the Full ASCII shift table shared with Code 93.
import { BarcodeError } from './types';

export const CODE39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
/** 9-bit element patterns (bar, space, ... bar; 1 = wide), in CODE39_CHARS order, then '*'. */
const PATTERNS = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c,
  0x04c, 0x01c, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0,
  0x085, 0x184, 0x0c4, 0x0a8, 0x0a2, 0x08a, 0x02a,
];
const STAR = 0x094;

/** Full ASCII: each code 0-127 as one or two Code 39 characters. */
export const FULL_ASCII: readonly string[] = (() => {
  const t: string[] = [];
  const ctrl = ['%U', ...Array.from({ length: 26 }, (_, i) => '$' + String.fromCharCode(65 + i)), '%A', '%B', '%C', '%D', '%E'];
  for (let c = 0; c < 128; c++) {
    const ch = String.fromCharCode(c);
    if (c < 32) t.push(ctrl[c]);
    else if (c === 32 || c === 45 || c === 46 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90)) t.push(ch);
    else if (c >= 33 && c <= 44) t.push('/' + String.fromCharCode(65 + c - 33));
    else if (c === 47) t.push('/O');
    else if (c === 58) t.push('/Z');
    else if (c >= 59 && c <= 63) t.push('%' + String.fromCharCode(70 + c - 59));
    else if (c === 64) t.push('%V');
    else if (c >= 91 && c <= 95) t.push('%' + String.fromCharCode(75 + c - 91));
    else if (c === 96) t.push('%W');
    else if (c >= 97 && c <= 122) t.push('+' + String.fromCharCode(c - 32));
    else if (c >= 123 && c <= 127) t.push('%' + String.fromCharCode(80 + c - 123));
  }
  return t;
})();

const FROM_PAIR = new Map(FULL_ASCII.map((pair, c) => [pair, String.fromCharCode(c)]));

/** Reads Code 39 data the way a Full ASCII scanner does (shift pairs become one character). */
export function decodeFullAscii(data: string): string {
  let out = '';
  for (let i = 0; i < data.length; i++) {
    const pair = data.slice(i, i + 2);
    if ('$%/+'.includes(data[i]) && pair.length === 2 && FROM_PAIR.has(pair)) {
      out += FROM_PAIR.get(pair);
      i++;
    } else out += data[i];
  }
  return out;
}

function elements(pattern: number, wide: number): number[] {
  const out: number[] = [];
  for (let bit = 8; bit >= 0; bit--) out.push((pattern >> bit) & 1 ? wide : 1);
  return out;
}

export function mod43(data: string): string {
  let sum = 0;
  for (const ch of data) sum += CODE39_CHARS.indexOf(ch);
  return CODE39_CHARS[sum % 43];
}

/** Returns the encoded characters (without '*') and the widths including start/stop. */
export function code39(text: string, opts: { checkDigit: boolean; fullAscii: boolean; wideRatio: number }): { data: string; widths: number[] } {
  if (text.length === 0) throw new BarcodeError('barcode.error.empty');
  let data = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (opts.fullAscii) {
      if (c > 127) throw new BarcodeError('barcode.error.charAt', { char: ch });
      data += FULL_ASCII[c];
    } else {
      if (ch === '*' || !CODE39_CHARS.includes(ch)) throw new BarcodeError('barcode.error.charAt', { char: ch });
      data += ch;
    }
  }
  if (opts.checkDigit) data += mod43(data);
  const widths: number[] = [];
  const chars = [STAR, ...Array.from(data, (ch) => PATTERNS[CODE39_CHARS.indexOf(ch)]), STAR];
  chars.forEach((p, i) => {
    if (i > 0) widths.push(1); // inter-character gap
    widths.push(...elements(p, opts.wideRatio));
  });
  return { data, widths };
}

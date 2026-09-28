// EAN-13 / JAN-13, EAN-8 / JAN-8, UPC-A, UPC-E and the EAN-2 / EAN-5 add-ons (ISO/IEC 15420).
import { digitsOnly, gs1CheckDigit } from './checksum';
import { BarcodeError, type Bar, type LinearSymbol, type TextPart } from './types';

/** Set A (odd parity) patterns as module strings; set C = complement, set B = reversed C. */
const L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
/** UPC-E parity for number system 0, indexed by check digit (E = even/G, O = odd/L). */
const UPCE_PARITY = ['GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL', 'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG'];
const EAN5_PARITY = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG'];
const EAN2_PARITY = ['LL', 'LG', 'GL', 'GG'];
/** Gap between the main symbol and the add-on, in modules. */
export const ADDON_GAP = 9;

const invert = (s: string) => Array.from(s, (c) => (c === '1' ? '0' : '1')).join('');
function digitModules(d: number, set: 'L' | 'G' | 'R'): string {
  const l = L_CODES[d];
  if (set === 'L') return l;
  const r = invert(l);
  return set === 'R' ? r : Array.from(r).reverse().join('');
}

/** Builds bar rectangles from a module string ('1' = dark). Guard ranges become 'guard' bars. */
function modulesToBars(modules: string, x0: number, isGuard: (i: number) => boolean, kind: Bar['kind'] = 'bar'): Bar[] {
  const bars: Bar[] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] !== '1') {
      i++;
      continue;
    }
    const start = i;
    while (i < modules.length && modules[i] === '1') i++;
    bars.push({ x: x0 + start, w: i - start, kind: kind === 'addon' ? 'addon' : isGuard(start) ? 'guard' : 'bar' });
  }
  return bars;
}

/** Validates digits and appends or verifies the GS1 check digit. */
function withCheckDigit(value: string, bodyLength: number): string {
  const digits = digitsOnly(value);
  if (!/^\d*$/.test(digits)) throw new BarcodeError('barcode.error.digitsOnly');
  if (digits.length === bodyLength) return digits + gs1CheckDigit(digits);
  if (digits.length === bodyLength + 1) {
    const expected = gs1CheckDigit(digits.slice(0, -1));
    if (Number(digits.at(-1)) !== expected) throw new BarcodeError('barcode.error.checkDigit', { expected });
    return digits;
  }
  throw new BarcodeError('barcode.error.length', { lengths: `${bodyLength} / ${bodyLength + 1}` });
}

const slotCenter = (x: number) => x + 3.5;

function ean13Like(digits: string): { modules: string; guardAt: (i: number) => boolean } {
  const parity = EAN13_PARITY[Number(digits[0])];
  let m = '101';
  for (let i = 1; i <= 6; i++) m += digitModules(Number(digits[i]), parity[i - 1] as 'L' | 'G');
  m += '01010';
  for (let i = 7; i <= 12; i++) m += digitModules(Number(digits[i]), 'R');
  m += '101';
  return { modules: m, guardAt: (i) => i < 3 || (i >= 45 && i < 50) || i >= 92 };
}

function addon(value: string, x0: number): { bars: Bar[]; parts: TextPart[]; width: number } {
  const digits = digitsOnly(value);
  if (!/^(\d{2}|\d{5})$/.test(digits)) throw new BarcodeError('barcode.error.addon');
  const parity =
    digits.length === 2
      ? EAN2_PARITY[Number(digits) % 4]
      : EAN5_PARITY[(3 * (Number(digits[0]) + Number(digits[2]) + Number(digits[4])) + 9 * (Number(digits[1]) + Number(digits[3]))) % 10];
  let m = '1011';
  const parts: TextPart[] = [];
  for (let i = 0; i < digits.length; i++) {
    if (i > 0) m += '01';
    parts.push({ text: digits[i], x: x0 + m.length + 3.5, anchor: 'middle', addon: true });
    m += digitModules(Number(digits[i]), parity[i] as 'L' | 'G');
  }
  return { bars: modulesToBars(m, x0, () => false, 'addon'), parts, width: m.length };
}

function finish(
  main: { modules: string; guardAt: (i: number) => boolean },
  parts: TextPart[],
  quiet: [number, number],
  expected: string[],
  addonValue: string,
): LinearSymbol {
  const bars = modulesToBars(main.modules, 0, main.guardAt);
  let width = main.modules.length;
  let right = quiet[1];
  if (addonValue.trim()) {
    const a = addon(addonValue, width + ADDON_GAP);
    bars.push(...a.bars);
    parts.push(...a.parts);
    width += ADDON_GAP + a.width;
    right = 5;
  }
  return {
    kind: 'linear',
    width,
    bars,
    layout: 'retail',
    hrt: parts.filter((p) => !p.addon).map((p) => p.text).join(''),
    parts,
    quiet: [quiet[0], right],
    expected,
    dataLength: expected[0].length,
  };
}

export function ean13(value: string, addonValue = ''): LinearSymbol {
  const digits = withCheckDigit(value, 12);
  const parts: TextPart[] = [{ text: digits[0], x: -1, anchor: 'end' }];
  for (let i = 1; i <= 6; i++) parts.push({ text: digits[i], x: slotCenter(3 + (i - 1) * 7), anchor: 'middle' });
  for (let i = 7; i <= 12; i++) parts.push({ text: digits[i], x: slotCenter(50 + (i - 7) * 7), anchor: 'middle' });
  return finish(ean13Like(digits), parts, [11, 7], [digits], addonValue);
}

export function upca(value: string, addonValue = ''): LinearSymbol {
  const digits = withCheckDigit(value, 11);
  const main = ean13Like('0' + digits);
  // The first and last digits' bars are extended like guards.
  const guardAt = (i: number) => main.guardAt(i) || (i >= 3 && i < 10) || (i >= 85 && i < 92);
  const parts: TextPart[] = [{ text: digits[0], x: -1, anchor: 'end', small: true }];
  for (let i = 1; i <= 5; i++) parts.push({ text: digits[i], x: slotCenter(3 + i * 7), anchor: 'middle' });
  for (let i = 6; i <= 10; i++) parts.push({ text: digits[i], x: slotCenter(50 + (i - 6) * 7), anchor: 'middle' });
  parts.push({ text: digits[11], x: 96, anchor: 'start', small: true });
  // Readers may report UPC-A in its EAN-13 form.
  return finish({ modules: main.modules, guardAt }, parts, [9, 9], [digits, '0' + digits], addonValue);
}

export function ean8(value: string, addonValue = ''): LinearSymbol {
  const digits = withCheckDigit(value, 7);
  let m = '101';
  for (let i = 0; i < 4; i++) m += digitModules(Number(digits[i]), 'L');
  m += '01010';
  for (let i = 4; i < 8; i++) m += digitModules(Number(digits[i]), 'R');
  m += '101';
  const parts: TextPart[] = [];
  for (let i = 0; i < 4; i++) parts.push({ text: digits[i], x: slotCenter(3 + i * 7), anchor: 'middle' });
  for (let i = 4; i < 8; i++) parts.push({ text: digits[i], x: slotCenter(36 + (i - 4) * 7), anchor: 'middle' });
  return finish({ modules: m, guardAt: (i) => i < 3 || (i >= 31 && i < 36) || i >= 64 }, parts, [7, 7], [digits], addonValue);
}

/** Expands the 6 UPC-E data digits (with number system) to the 11-digit UPC-A body. */
export function upceToUpca(ns: string, d: string): string {
  const last = Number(d[5]);
  if (last <= 2) return `${ns}${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
  if (last === 3) return `${ns}${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  if (last === 4) return `${ns}${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  return `${ns}${d.slice(0, 5)}0000${d[5]}`;
}

/** Compresses an 11-digit UPC-A body (number system 0/1) to UPC-E data digits, or null. */
export function upcaToUpce(body: string): string | null {
  if (!/^[01]\d{10}$/.test(body)) return null;
  const m = body.slice(1, 6);
  const p = body.slice(6, 11);
  let d: string | null = null;
  if (/^\d\d[012]00$/.test(m) && p.startsWith('00')) d = `${m[0]}${m[1]}${p.slice(2)}${m[2]}`;
  else if (/^\d\d\d00$/.test(m) && p.startsWith('000')) d = `${m.slice(0, 3)}${p.slice(3)}3`;
  else if (/^\d{4}0$/.test(m) && p.startsWith('0000')) d = `${m.slice(0, 4)}${p[4]}4`;
  else if (p.startsWith('0000') && Number(p[4]) >= 5) d = `${m}${p[4]}`;
  return d && upceToUpca(body[0], d) === body ? d : null;
}

/** Accepts 6 (NS 0), 7 (NS + 6), 8 (with check) digits, or an 11/12-digit UPC-A that can be zero-suppressed. */
export function upce(value: string, addonValue = ''): LinearSymbol {
  const digits = digitsOnly(value);
  if (!/^\d+$/.test(digits)) throw new BarcodeError('barcode.error.digitsOnly');
  let ns: string;
  let data: string;
  let given: string | null = null;
  if (digits.length === 6) [ns, data] = ['0', digits];
  else if (digits.length === 7 || digits.length === 8) [ns, data, given] = [digits[0], digits.slice(1, 7), digits[7] ?? null];
  else if (digits.length === 11 || digits.length === 12) {
    const d = upcaToUpce(digits.slice(0, 11));
    if (!d) throw new BarcodeError('barcode.error.upceCompress');
    [ns, data, given] = [digits[0], d, digits[11] ?? null];
  } else throw new BarcodeError('barcode.error.length', { lengths: '6 / 7 / 8 / 11 / 12' });
  if (ns !== '0' && ns !== '1') throw new BarcodeError('barcode.error.upceSystem');
  const check = gs1CheckDigit(upceToUpca(ns, data));
  if (given !== null && Number(given) !== check) throw new BarcodeError('barcode.error.checkDigit', { expected: check });
  const parity = UPCE_PARITY[check];
  let m = '101';
  for (let i = 0; i < 6; i++) {
    const p = ns === '0' ? parity[i] : parity[i] === 'L' ? 'G' : 'L';
    m += digitModules(Number(data[i]), p as 'L' | 'G');
  }
  m += '010101';
  const parts: TextPart[] = [{ text: ns, x: -1, anchor: 'end', small: true }];
  for (let i = 0; i < 6; i++) parts.push({ text: data[i], x: slotCenter(3 + i * 7), anchor: 'middle' });
  parts.push({ text: String(check), x: 52, anchor: 'start', small: true });
  const upcA = `${upceToUpca(ns, data)}${check}`;
  // Readers may report UPC-E expanded to UPC-A / EAN-13.
  const expected = [`${ns}${data}${check}`, upcA, '0' + upcA];
  return finish({ modules: m, guardAt: (i) => i < 3 || i >= 45 }, parts, [9, 7], expected, addonValue);
}

// 郵便カスタマバーコード (Japan Post customer barcode): start, 7-digit postcode, 13 address
// characters (padded with CC4), a modulus-19 check character and stop. Each character is three
// 4-state bars. Specification: 日本郵便「バーコード仕様」.

import { BarcodeError, type FourState, type FourStateSymbol } from './types';

/** Bar patterns: 1 = full, 2 = upper (ascender), 3 = lower (descender), 4 = tracker. */
const PATTERNS: Record<string, string> = {
  '1': '114',
  '2': '132',
  '3': '312',
  '4': '123',
  '5': '141',
  '6': '321',
  '7': '213',
  '8': '231',
  '9': '411',
  '0': '144',
  '-': '414',
  CC1: '324',
  CC2: '342',
  CC3: '234',
  CC4: '432',
  CC5: '243',
  CC6: '423',
  CC7: '441',
  CC8: '111',
};
const STATES: Record<string, FourState> = { '1': 'F', '2': 'A', '3': 'D', '4': 'T' };
const START = '13';
const STOP = '31';

/** Check character value: digits 0–9, "-" 10, CC1–CC8 11–18. */
function checkValue(c: string): number {
  if (/^\d$/.test(c)) return Number(c);
  if (c === '-') return 10;
  return 10 + Number(c.slice(2));
}

const KANJI_DIGITS: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** "三十二" -> 32, "百五" -> 105, "二〇一" -> 201. */
function kanjiNumber(s: string): number {
  if (!/[十百千]/.test(s)) return Number([...s].map((c) => KANJI_DIGITS[c]).join(''));
  let total = 0;
  let digit = 0;
  for (const c of s) {
    if (c in KANJI_DIGITS) digit = KANJI_DIGITS[c];
    else {
      const unit = c === '十' ? 10 : c === '百' ? 100 : 1000;
      total += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + digit;
}

/**
 * Extracts the address number (住所表示番号) as the barcode spells it, e.g.
 * "霞が関1丁目3番2号 XYZビル201" -> "1-3-2-201", "三丁目五番地B棟" -> "3-5B".
 * Kanji numerals are only read next to 丁目/番/号/地割/の or a dash, so place names such as 四日市 stay text.
 */
export function addressNumber(address: string): string {
  let s = address.normalize('NFKC').toUpperCase();
  s = s.replace(/(?<=丁目|丁|番地|番|号|地割|の|ノ|[‐−ー－-])[〇零一二三四五六七八九十百千]+|[〇零一二三四五六七八九十百千]+(?=丁目|丁|番地|番|号|地割)/g, (m) =>
    String(kanjiNumber(m)),
  );
  // Unit words and dashes separate the numbers.
  s = s.replace(/丁目|丁|番地|番|号|地割|の|ノ|[‐‑‒–—―−ー－-]/g, '-');
  // Runs of two or more letters (building names) are dropped; anything else separates.
  s = s.replace(/[A-Z]{2,}/g, '-').replace(/[^0-9A-Z-]+/g, '-');
  // Hyphens next to a letter go, consecutive ones collapse, and none at either end.
  s = s.replace(/-+(?=[A-Z])|(?<=[A-Z])-+/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  return s;
}

/** Characters for the 20 data positions (postcode + address), letters as CC1–CC3 pairs. */
export function customerChars(postcode: string, address: string): string[] {
  const out: string[] = [...postcode];
  for (const c of address) {
    if (/[0-9-]/.test(c)) out.push(c);
    else {
      const i = c.charCodeAt(0) - 65;
      // A–J: CC1 + 0–9, K–T: CC2 + 0–9, U–Z: CC3 + 0–5.
      const pair = [`CC${Math.floor(i / 10) + 1}`, String(i % 10)];
      // A letter is never split across the 20-character limit.
      if (out.length + 2 > 20) break;
      out.push(...pair);
    }
    if (out.length >= 20) break;
  }
  while (out.length < 20) out.push('CC4');
  return out.slice(0, 20);
}

/**
 * Value: "100-0013 東京都千代田区霞が関1丁目3番2号" or an already extracted "1000013 1-3-2".
 * The postcode is the first seven digits; the rest is the address.
 */
export function japanPost(value: string): FourStateSymbol {
  const v = value.normalize('NFKC').trim();
  const m = /^〒?\s*(\d{3})-?(\d{4})\s*(.*)$/s.exec(v);
  if (!m) throw new BarcodeError('barcode.error.postcode');
  const postcode = m[1] + m[2];
  const addr = addressNumber(m[3]);
  const chars = customerChars(postcode, addr);
  const sum = chars.reduce((a, c) => a + checkValue(c), 0);
  const check = (19 - (sum % 19)) % 19;
  const checkChar = check <= 9 ? String(check) : check === 10 ? '-' : `CC${check - 10}`;
  const digits = START + [...chars, checkChar].map((c) => PATTERNS[c]).join('') + STOP;
  return {
    kind: 'fourstate',
    bars: Array.from(digits, (d) => STATES[d]),
    hrt: addr ? `${postcode} ${addr}` : postcode,
    // Specification: at least 2 mm (about 3.3 bar widths at 10 pt) around the symbol.
    quiet: [4, 4],
    expected: [],
    dataLength: 7 + addr.length,
  };
}

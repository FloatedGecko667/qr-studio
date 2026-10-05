// 書籍JANコード (Japan Publication Code barcode): two EAN-13 symbols printed one above the other.
// Upper: the ISBN as EAN-13 (978/979). Lower: "192" + 4-digit classification code (Cコード)
// + 5-digit retail price without tax + check digit.

import { gs1CheckDigit } from './checksum';
import { ean13 } from './ean';
import { BarcodeError, type StackedSymbol } from './types';

export interface BookJanFields {
  /** ISBN-13 digits (converted from ISBN-10 when needed). */
  isbn13: string;
  /** Classification code, 4 digits ("C" not included). */
  cCode: string;
  /** Price without tax in yen, 0–99999. */
  price: number;
}

/** ISBN-10 check character (mod 11, "X" = 10). */
function isbn10Check(body: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? 'X' : String(c);
}

/**
 * Reads "978-4-7741-9999-4 C3055 ¥2980E" (hyphens, spaces, "¥"/"円"/"E" optional; full-width accepted).
 * The ISBN may be ISBN-13 or ISBN-10.
 */
export function parseBookJan(value: string): BookJanFields {
  const v = value.normalize('NFKC').toUpperCase().replace(/[\s\-‐−ー]/g, '');
  const m = /^(?:ISBN)?(97[89]\d{10}|\d{9}[\dX])C(\d{4})[¥\\]?(\d{1,5})(?:円|E)?$/.exec(v);
  if (!m) throw new BarcodeError('barcode.error.bookJanFormat');
  const [, isbn, cCode, price] = m;
  let isbn13: string;
  if (isbn.length === 10) {
    if (isbn10Check(isbn) !== isbn[9]) throw new BarcodeError('barcode.error.isbnCheck');
    const body = `978${isbn.slice(0, 9)}`;
    isbn13 = body + gs1CheckDigit(body);
  } else {
    if (gs1CheckDigit(isbn.slice(0, 12)) !== Number(isbn[12])) throw new BarcodeError('barcode.error.isbnCheck');
    isbn13 = isbn;
  }
  return { isbn13, cCode, price: Number(price) };
}

/**
 * Caption for the ISBN. Hyphen positions depend on the group and publisher, so the user's own
 * hyphenation is kept when it was given in ISBN-13 form; otherwise only the prefix is split off.
 */
function isbnLabel(value: string, isbn13: string): string {
  const typed = /97[89](?:-?\d){10}/.exec(value.normalize('NFKC').replace(/[‐−ー]/g, '-'))?.[0];
  if (typed && typed.replace(/-/g, '') === isbn13 && typed.includes('-', 4)) return `ISBN${typed}`;
  return `ISBN${isbn13.slice(0, 3)}-${isbn13.slice(3)}`;
}

export function bookJan(value: string): StackedSymbol {
  const f = parseBookJan(value);
  const lowerBody = `192${f.cCode}${String(f.price).padStart(5, '0')}`;
  const lower = lowerBody + gs1CheckDigit(lowerBody);
  const upper = ean13(f.isbn13);
  return {
    kind: 'stacked',
    rows: [upper, ean13(lower)],
    captions: [isbnLabel(value, f.isbn13), `C${f.cCode} ¥${f.price}E`],
    // JIS X 0507 / 日本図書コード: the two symbols are printed with a small gap.
    gap: 8,
    hrt: `${f.isbn13} ${lower}`,
    expected: [f.isbn13, lower],
    dataLength: 26,
  };
}

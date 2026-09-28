import { sjisBytes } from './sjis';

export type Mode = 'numeric' | 'alnum' | 'byte' | 'kanji';
export type Charset = 'sjis' | 'utf8';

export const ALNUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** One input character with every representation the encoder may choose from. */
export interface Unit {
  /** Bytes in the selected charset (used by byte mode and for structured append parity). */
  readonly bytes: Uint8Array;
  /** Numeric/alphanumeric value, or -1 when the mode is not available. */
  readonly numeric: number;
  readonly alnum: number;
  /** 13-bit Kanji mode value, or -1 when the mode is not available. */
  readonly kanji: number;
}

/** ASCII Group Separator; stands for FNC1 inside GS1 element strings. */
export const GS = 0x1d;

function kanjiValue(bytes: Uint8Array): number {
  if (bytes.length !== 2) return -1;
  const code = (bytes[0] << 8) | bytes[1];
  let v: number;
  if (code >= 0x8140 && code <= 0x9ffc) v = code - 0x8140;
  else if (code >= 0xe040 && code <= 0xebbf) v = code - 0xc140;
  else return -1;
  const lsb = v & 0xff;
  // Second byte 0x7F and above 0xFC are not valid Shift_JIS trail bytes.
  if (lsb > 0xbc) return -1;
  return (v >> 8) * 0xc0 + lsb;
}

function byteUnit(b: number, fnc1: boolean): Unit {
  const isDigit = b >= 0x30 && b <= 0x39;
  const ch = String.fromCharCode(b);
  // In FNC1 mode '%' has a special meaning in alphanumeric mode, so keep it in byte mode.
  const alnumIndex = b < 0x80 && !(fnc1 && ch === '%') ? ALNUM_CHARS.indexOf(ch) : -1;
  return {
    bytes: Uint8Array.of(b),
    numeric: isDigit ? b - 0x30 : -1,
    alnum: alnumIndex,
    kanji: -1,
  };
}

/** Encodes one character as Shift_JIS, or returns null when it has no mapping. */
function toSjis(ch: string): Uint8Array | null {
  return ch.codePointAt(0)! < 0x80 ? Uint8Array.of(ch.codePointAt(0)!) : sjisBytes(ch);
}

/** True when every character of `text` can be represented in Shift_JIS. */
export function isSjisEncodable(text: string): boolean {
  for (const ch of text) if (toSjis(ch) === null) return false;
  return true;
}

export function textToUnits(text: string, charset: Charset, fnc1 = false): Unit[] {
  const units: Unit[] = [];
  const utf8 = new TextEncoder();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      units.push(byteUnit(cp, fnc1));
      continue;
    }
    if (charset === 'sjis') {
      const bytes = toSjis(ch);
      if (!bytes) throw new RangeError(`Character not representable in Shift_JIS: ${ch}`);
      units.push({ bytes, numeric: -1, alnum: -1, kanji: kanjiValue(bytes) });
    } else {
      units.push({ bytes: utf8.encode(ch), numeric: -1, alnum: -1, kanji: -1 });
    }
  }
  return units;
}

export function bytesToUnits(bytes: Uint8Array): Unit[] {
  return Array.from(bytes, (b) => byteUnit(b, false));
}

export function unitsToBytes(units: readonly Unit[]): Uint8Array {
  const total = units.reduce((n, u) => n + u.bytes.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const u of units) {
    out.set(u.bytes, i);
    i += u.bytes.length;
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { isSjisEncodable, textToUnits } from './chars';
import { sjisBytes } from './sjis';

const hex = (b: Uint8Array | null) => (b ? Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') : null);

describe('Shift_JIS table', () => {
  it('encodes kanji, kana and symbols', () => {
    expect(hex(sjisBytes('漢'))).toBe('8abf');
    expect(hex(sjisBytes('あ'))).toBe('82a0');
    expect(hex(sjisBytes('ｱ'))).toBe('b1');
    expect(hex(sjisBytes('①'))).toBe('8740');
  });

  it('accepts both CP932 and JIS spellings of ambiguous characters', () => {
    expect(hex(sjisBytes('〜'))).toBe('8160');
    expect(hex(sjisBytes('～'))).toBe('8160');
    expect(hex(sjisBytes('−'))).toBe('817c');
    expect(hex(sjisBytes('－'))).toBe('817c');
  });

  it('rejects characters outside Shift_JIS', () => {
    expect(sjisBytes('😀')).toBeNull();
    expect(isSjisEncodable('abc漢字')).toBe(true);
    expect(isSjisEncodable('한국')).toBe(false);
  });

  it('assigns Kanji mode values only inside the Kanji ranges', () => {
    const [kan, maru, kata] = textToUnits('漢①ｱ', 'sjis');
    expect(kan.kanji).toBe(((0x8abf - 0x8140) >> 8) * 0xc0 + ((0x8abf - 0x8140) & 0xff));
    expect(maru.kanji).toBeGreaterThanOrEqual(0);
    expect(kata.kanji).toBe(-1);
  });
});

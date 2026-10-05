import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decodeLinear } from '../../test/decode';
import { bookJan, parseBookJan } from './bookJan';
import { addressNumber, customerChars, japanPost } from './japanPost';
import { BarcodeError, type FourState } from './types';

const require = createRequire(import.meta.url);
const bwipjs = require('bwip-js') as { raw: (bcid: string, text: string) => { bbs: number[]; bhs: number[] }[] };

describe('書籍JAN', () => {
  it('reads ISBN-13 and ISBN-10 with C code and price', () => {
    expect(parseBookJan('978-4-7741-9999-3 C3055 ¥2980E')).toEqual({ isbn13: '9784774199993', cCode: '3055', price: 2980 });
    expect(parseBookJan('ISBN4-7741-9999-0　Ｃ３０５５　￥２９８０')).toMatchObject({ isbn13: '9784774199993', cCode: '3055' });
    expect(() => parseBookJan('978-4-7741-9999-4 C3055 ¥2980')).toThrow(BarcodeError);
    expect(() => parseBookJan('978-4-7741-9999-3 2980')).toThrow(BarcodeError);
  });

  it('builds the ISBN row and the 192 + C code + price row, both readable', async () => {
    const s = bookJan('978-4-7741-9999-3 C3055 ¥2980');
    expect(s.expected).toEqual(['9784774199993', '1923055029804']);
    expect(s.captions).toEqual(['ISBN978-4-7741-9999-3', 'C3055 ¥2980E']);
    for (const [i, row] of s.rows.entries()) {
      const [r] = await decodeLinear(row);
      expect(r?.text).toBe(s.expected[i]);
    }
  });
});

/** bwip-js 4-state bars: bottom offset and height map to the four states. */
function bwipStates(text: string): FourState[] {
  const [r] = bwipjs.raw('japanpost', text);
  const top = Math.max(...r.bhs.map((h, i) => h + r.bbs[i]));
  return r.bhs.map((h, i) => {
    const bottom = r.bbs[i];
    const full = Math.abs(h - top) < 1e-6;
    if (full) return 'F';
    if (bottom > 1e-6) return Math.abs(bottom + h - top) < 1e-6 ? 'A' : 'T';
    return 'D';
  });
}

describe('郵便カスタマバーコード', () => {
  it('extracts the address number', () => {
    expect(addressNumber('東京都千代田区霞が関1丁目3番2号')).toBe('1-3-2');
    expect(addressNumber('霞が関１丁目３−２ XYZビル201号室')).toBe('1-3-2-201');
    expect(addressNumber('四日市市安島三丁目五番地B棟')).toBe('3-5B');
    expect(addressNumber('大字十二番地の三')).toBe('12-3');
  });

  it('turns letters into CC pairs and pads to 20 characters with CC4', () => {
    expect(customerChars('1000013', '3-5B')).toEqual(['1', '0', '0', '0', '0', '1', '3', '3', '-', '5', 'CC1', '1', ...Array(8).fill('CC4')]);
  });

  for (const [value, bwip] of [
    ['100-0013 東京都千代田区霞が関1丁目3番2号', '10000131-3-2'],
    ['2630023 千葉市稲毛区緑町3丁目30-8 郵便ビル403号', '26300233-30-8-403'],
    ['〒014-0113 秋田県大仙市堀見内南田茂木 添60-1', '014011360-1'],
    ['1100016 台東区台東5-6-3 ABCビル10F', '11000165-6-3-10F'],
    ['0600906 北海道札幌市東区北六条東4丁目 郵便センター6号館', '06009064-6'],
  ] as const) {
    it(`matches bwip-js for ${bwip}`, () => {
      expect(japanPost(value).bars).toEqual(bwipStates(bwip));
    });
  }

  it('rejects input without a postcode', () => {
    expect(() => japanPost('東京都千代田区')).toThrow(BarcodeError);
  });
});

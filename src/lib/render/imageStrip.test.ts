import { describe, expect, it } from 'vitest';
import { stripJpeg, stripWebp } from './imageStrip';

function chunk(id: string, data: number[]): number[] {
  const len = data.length;
  return [...new TextEncoder().encode(id), len & 0xff, (len >> 8) & 0xff, 0, 0, ...data, ...(len & 1 ? [0] : [])];
}

function riff(...chunks: number[][]): Uint8Array {
  const body = chunks.flat();
  const size = 4 + body.length;
  return Uint8Array.from([...new TextEncoder().encode('RIFF'), size & 0xff, (size >> 8) & 0xff, 0, 0, ...new TextEncoder().encode('WEBP'), ...body]);
}

const tags = (b: Uint8Array) => {
  const out: string[] = [];
  for (let i = 12; i + 8 <= b.length; ) {
    const len = b[i + 4] | (b[i + 5] << 8);
    out.push(String.fromCharCode(...b.subarray(i, i + 4)));
    i += 8 + len + (len & 1);
  }
  return out;
};

describe('stripWebp', () => {
  const vp8x = (flags: number) => chunk('VP8X', [flags, 0, 0, 0, 15, 0, 0, 11, 0, 0]);
  it('drops ICCP and the VP8X header for opaque images', () => {
    const out = stripWebp(riff(vp8x(0x20), chunk('ICCP', Array(456).fill(7)), chunk('VP8 ', [1, 2, 3])));
    expect(tags(out)).toEqual(['VP8 ']);
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
  });

  it('keeps VP8X for alpha and clears the ICC flag', () => {
    const out = stripWebp(riff(vp8x(0x20 | 0x10), chunk('ICCP', [1, 2]), chunk('ALPH', [9]), chunk('VP8 ', [1, 2, 3])));
    expect(tags(out)).toEqual(['VP8X', 'ALPH', 'VP8 ']);
    expect(out[20]).toBe(0x10);
  });

  it('returns input unchanged when there is nothing to strip or it is malformed', () => {
    const plain = riff(chunk('VP8 ', [1, 2]));
    expect(stripWebp(plain)).toBe(plain);
    const broken = Uint8Array.from([...riff(chunk('VP8 ', [1, 2])).subarray(0, 14)]);
    expect(stripWebp(broken)).toBe(broken);
  });
});

describe('stripJpeg', () => {
  it('removes APP1/APP2/COM before the scan and keeps tables and data', () => {
    const seg = (m: number, data: number[]) => [0xff, m, 0, data.length + 2, ...data];
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      ...seg(0xe0, [1, 2]), // APP0 JFIF
      ...seg(0xe2, Array(20).fill(3)), // APP2 ICC
      ...seg(0xe1, [4]), // APP1 EXIF
      ...seg(0xfe, [5]), // COM
      ...seg(0xdb, [6, 6]), // DQT
      0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9,
    ]);
    expect(Array.from(stripJpeg(jpeg))).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xdb, 0, 4, 6, 6, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9]);
  });
});

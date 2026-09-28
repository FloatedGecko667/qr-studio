import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../test/decode';
import { base45Decode, base45Encode, detectImage, encodeImage, sniffImage, toBase64 } from './imageData';
import { imageByteBudget } from './imageBudget';
import { FORMS } from './payload/forms';
import { runPipeline } from './pipeline';
import { DEFAULT_SYMBOL } from './settings';

const bytes = (s: string) => new TextEncoder().encode(s);
/** Minimal byte strings with valid image signatures. */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff)]);
const WEBP = Uint8Array.from([...bytes('RIFF'), 0, 0, 0, 0, ...bytes('WEBPVP8 '), 1, 2, 3]);

describe('Base45 (RFC 9285)', () => {
  it('matches the RFC test vectors', () => {
    expect(base45Encode(bytes('AB'))).toBe('BB8');
    expect(base45Encode(bytes('Hello!!'))).toBe('%69 VD92EX0');
    expect(base45Encode(bytes('base-45'))).toBe('UJCLQE7W581');
    expect(new TextDecoder().decode(base45Decode('QED8WEX0')!)).toBe('ietf!');
  });

  it('rejects invalid input', () => {
    expect(base45Decode('GGW')).toBeNull(); // 65535 < value overflow
    expect(base45Decode('ab')).toBeNull();
    expect(base45Decode('A')).toBeNull();
  });
});

describe('image detection', () => {
  it('sniffs signatures', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(WEBP)).toBe('image/webp');
    expect(sniffImage(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImage(bytes('hello'))).toBeNull();
  });

  it('finds images in raw bytes, data URLs, Base64 and Base45', () => {
    expect(detectImage(PNG, '')?.encoding).toBe('binary');
    const url = encodeImage(PNG, 'image/png', 'base64').text!;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(detectImage(bytes(url), url)).toMatchObject({ mime: 'image/png', encoding: 'base64' });
    expect(detectImage(bytes('x'), toBase64(PNG))?.encoding).toBe('base64');
    const b45 = encodeImage(PNG, 'image/png', 'base45').text!;
    expect(detectImage(bytes(b45), b45)).toMatchObject({ mime: 'image/png', encoding: 'base45' });
    expect(Array.from(detectImage(bytes(b45), b45)!.bytes)).toEqual(Array.from(PNG));
    expect(detectImage(bytes('HELLO'), 'HELLO')).toBeNull();
  });
});

describe('image budget', () => {
  it('orders encodings binary > base45 > base64', () => {
    const one = { ...DEFAULT_SYMBOL, ecLevel: 'L' as const, structuredAppend: 1 };
    expect(imageByteBudget(one, 'binary', 'image/webp')).toBe(2953);
    expect(imageByteBudget(one, 'base45', 'image/webp')).toBe(2864);
    expect(imageByteBudget(one, 'base64', 'image/webp')).toBe(2196); // floor((2953 - 23) / 4) * 3
    expect(imageByteBudget({ ...one, structuredAppend: 'auto' }, 'binary', 'image/webp')).toBeGreaterThan(46000);
    expect(imageByteBudget({ ...one, type: 'micro', version: 2 }, 'binary', 'image/webp')).toBe(0);
  });

  it('a file of exactly the budget encodes and decodes for every encoding', async () => {
    for (const encoding of ['binary', 'base64', 'base45'] as const) {
      for (const structuredAppend of [1, 3] as const) {
        const symbol = { ...DEFAULT_SYMBOL, ecLevel: 'L' as const, version: 10, structuredAppend };
        const n = imageByteBudget(symbol, encoding, 'image/png');
        const img = Uint8Array.from({ length: n }, (_, i) => (i < PNG.length ? PNG[i] : (i * 31) & 0xff));
        const payload = FORMS.image.build({ ...FORMS.image.defaults, image: img, mime: 'image/png', encoding });
        const r = runPipeline(payload, symbol);
        expect(r.status, `${encoding} x${structuredAppend}`).toBe('ok');
        if (r.status !== 'ok' || structuredAppend > 1) continue;
        const [res] = await decodeSymbol(r.result.symbols[0]);
        expect(Array.from(detectImage(res.bytes, res.text)!.bytes)).toEqual(Array.from(img));
      }
    }
  });
});

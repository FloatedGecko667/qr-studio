import { describe, expect, it } from 'vitest';
import { qrFileName } from './filename';

describe('qrFileName', () => {
  it('names a code after its content', () => {
    expect(qrFileName('url', {}, 'https://example.com/', 'qr')).toBe('qr-example.com');
    expect(qrFileName('url', {}, 'https://example.com/a/b?x=1', 'qr')).toBe('qr-example.com-a-b');
    expect(qrFileName('wifi', { ssid: 'Home 5G' }, 'WIFI:...', 'qr')).toBe('qr-wifi-Home-5G');
    expect(qrFileName('vcard', { lastName: '山田', firstName: '太郎' }, '', 'qr')).toBe('qr-山田太郎');
    expect(qrFileName('text', {}, 'hello world\nsecond line', 'qr')).toBe('qr-hello-world');
  });

  it('keeps names safe and short, with a fallback', () => {
    expect(qrFileName('text', {}, 'a/b:c*d', 'qr')).toBe('qr-a_b_c_d');
    expect(qrFileName('text', {}, 'x'.repeat(100), 'qr')).toHaveLength(43);
    expect(qrFileName('binary', {}, undefined, 'qr-2-M')).toBe('qr-2-M');
    expect(qrFileName('url', {}, 'not a url', 'qr-2-M')).toBe('qr-2-M');
  });
});

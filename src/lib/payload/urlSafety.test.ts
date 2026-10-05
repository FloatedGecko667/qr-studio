import { describe, expect, it } from 'vitest';
import { decodePunycode, toUnicodeHost, urlSafety } from './urlSafety';

describe('decodePunycode', () => {
  it('decodes RFC 3492 labels', () => {
    expect(decodePunycode('bcher-kva')).toBe('bücher');
    expect(decodePunycode('mnchen-3ya')).toBe('münchen');
    expect(decodePunycode('wgv71a119e')).toBe('日本語');
    expect(decodePunycode('80ak6aa92e')).toBe('аррӏе');
  });

  it('rejects malformed input', () => {
    expect(decodePunycode('bcher-kv!')).toBeNull();
    expect(decodePunycode('99999999999')).toBeNull();
  });
});

describe('toUnicodeHost', () => {
  it('converts only internationalised labels', () => {
    expect(toUnicodeHost('www.xn--wgv71a119e.jp')).toBe('www.日本語.jp');
    expect(toUnicodeHost('example.com')).toBeNull();
  });
});

describe('urlSafety', () => {
  it('a plain https link has no warnings', () => {
    expect(urlSafety('https://www.example.com/path?q=1')).toEqual({ host: 'www.example.com', unicodeHost: null, userinfo: '', warnings: [] });
  });

  it('flags http, IP addresses, user info, look-alike domains and shorteners', () => {
    expect(urlSafety('http://example.com')?.warnings).toEqual(['http']);
    expect(urlSafety('https://192.168.0.1/login')?.warnings).toEqual(['ip']);
    expect(urlSafety('https://[::1]:8080/')?.warnings).toEqual(['ip']);
    // Numeric hosts are normalised by the URL parser before the check.
    expect(urlSafety('https://2130706433/')).toMatchObject({ host: '127.0.0.1', warnings: ['ip'] });
    expect(urlSafety('https://www.bank.example@evil.example/')).toMatchObject({
      host: 'evil.example',
      userinfo: 'www.bank.example',
      warnings: ['userinfo'],
    });
    expect(urlSafety('https://xn--80ak6aa92e.com/')).toMatchObject({ unicodeHost: 'аррӏе.com', warnings: ['idn'] });
    expect(urlSafety('https://日本語.jp/')).toMatchObject({ host: 'xn--wgv71a119e.jp', unicodeHost: '日本語.jp', warnings: ['idn'] });
    expect(urlSafety('https://bit.ly/abc')?.warnings).toEqual(['shortener']);
    expect(urlSafety('http://user:pw@10.0.0.1/')?.warnings).toEqual(['http', 'userinfo', 'ip']);
  });

  it('ignores what is not an http(s) URL', () => {
    expect(urlSafety('not a url')).toBeNull();
    expect(urlSafety('ftp://example.com')).toBeNull();
  });
});

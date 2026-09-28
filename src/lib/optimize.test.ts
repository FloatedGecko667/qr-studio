import { describe, expect, it } from 'vitest';
import { decodeSymbol } from '../test/decode';
import { buildOptimized, compressText, decompressText, DEFAULT_OPTIMIZE, toHalfwidth, uppercaseUrl } from './optimize';
import { FORMS } from './payload/forms';
import { runPipeline } from './pipeline';
import { DEFAULT_SYMBOL } from './settings';

const all = { uppercaseUrl: true, halfwidth: true, compactContact: true, deflate: false };

describe('uppercaseUrl', () => {
  it('uppercases only scheme and host', () => {
    expect(uppercaseUrl('https://www.example.com/Path?q=a#x')).toBe('HTTPS://WWW.EXAMPLE.COM/Path?q=a#x');
    expect(uppercaseUrl('http://user:Pw@host.jp:8080/')).toBe('HTTP://user:Pw@HOST.JP:8080/');
    expect(uppercaseUrl('mailto:a@b.jp')).toBe('mailto:a@b.jp');
    expect(uppercaseUrl('https://例え.jp/')).toBe('HTTPS://例え.JP/');
  });

  it('saves bits and still decodes to an equivalent URL', async () => {
    const url = 'https://www.example.co.jp/';
    const plain = runPipeline(buildOptimized('url', { url }, DEFAULT_OPTIMIZE), DEFAULT_SYMBOL);
    const upper = runPipeline(buildOptimized('url', { url }, all), DEFAULT_SYMBOL);
    if (plain.status !== 'ok' || upper.status !== 'ok') throw new Error('encode failed');
    expect(upper.result.symbols[0].usedBits).toBeLessThan(plain.result.symbols[0].usedBits);
    const [res] = await decodeSymbol(upper.result.symbols[0]);
    expect(res.text).toBe('HTTPS://WWW.EXAMPLE.CO.JP/');
  });
});

describe('halfwidth', () => {
  it('converts full-width ASCII and ideographic space only', () => {
    expect(toHalfwidth('ＡＢＣ　１２３！ｱ漢')).toBe('ABC 123!ｱ漢');
  });

  it('never touches Wi-Fi credentials', () => {
    const f = { ...FORMS.wifi.defaults, ssid: 'ＮＥＴ', password: 'ｐａｓｓ' };
    expect(buildOptimized('wifi', f, all).text).toContain('S:ＮＥＴ;P:ｐａｓｓ;');
  });
});

describe('compactContact', () => {
  const contact = { ...FORMS.vcard.defaults, lastName: '山田', firstName: '太郎', tel: '090-1234-5678' };
  it('switches vCard to the shorter MeCard', () => {
    const p = buildOptimized('vcard', contact, all);
    expect(p.text).toBe('MECARD:N:山田,太郎;TEL:090-1234-5678;;');
    expect(p.text!.length).toBeLessThan(FORMS.vcard.build(contact).text!.length);
  });

  it('keeps vCard when a job title is set, without TEL parameters', () => {
    const p = buildOptimized('vcard', { ...contact, title: '部長' }, all);
    expect(p.text).toContain('TITLE:部長');
    expect(p.text).toContain('TEL:090-1234-5678');
  });
});

describe('deflate', () => {
  it('round-trips and rejects foreign data', () => {
    const text = 'QR Studio テスト '.repeat(40);
    expect(decompressText(compressText(text))).toBe(text);
    expect(decompressText(new TextEncoder().encode('hello'))).toBeNull();
  });

  it('is used only when it needs fewer bits', () => {
    const opt = { ...DEFAULT_OPTIMIZE, deflate: true };
    const short = runPipeline(buildOptimized('text', { text: 'hello' }, opt), DEFAULT_SYMBOL);
    expect(short.status === 'ok' && short.compression).toBeUndefined();
    const long = runPipeline(buildOptimized('text', { text: 'Lorem ipsum dolor sit amet. '.repeat(60) }, opt), DEFAULT_SYMBOL);
    if (long.status !== 'ok') throw new Error('encode failed');
    expect(long.compression!.compressedBytes).toBeLessThan(long.compression!.originalBytes / 4);
    expect(long.opts.eci).toBeUndefined();
  });

  it('decodes back through zxing and inflate', async () => {
    const text = '日本語の長い文章。'.repeat(80);
    const r = runPipeline(buildOptimized('text', { text }, { ...DEFAULT_OPTIMIZE, deflate: true }), DEFAULT_SYMBOL);
    if (r.status !== 'ok') throw new Error('encode failed');
    const [res] = await decodeSymbol(r.result.symbols[0]);
    expect(decompressText(res.bytes)).toBe(text);
  });
});

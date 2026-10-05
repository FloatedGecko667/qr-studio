import { describe, expect, it } from 'vitest';
import {
  buildEmail,
  buildEvent,
  toIcalUtc,
  withUtm,
  buildGeo,
  buildGs1,
  buildMecard,
  buildMultiUrl,
  buildSms,
  buildTel,
  buildUrl,
  buildVcard,
  buildWifi,
  parseHex,
  validGtinCheckDigit,
  type ContactFields,
} from '.';

const contact: ContactFields = {
  lastName: '山田',
  firstName: '太郎',
  org: 'ACME; Inc.',
  title: '',
  tel: '+81-90-1234-5678',
  email: 'taro@example.com',
  url: 'https://example.com',
  address: '東京都, 千代田区',
  note: 'line1\nline2',
};

describe('payload builders', () => {
  it('validates URLs and flags dangerous schemes', () => {
    expect(buildUrl({ url: 'https://example.com' })).toMatchObject({ text: 'https://example.com', errors: [], warnings: [] });
    expect(buildUrl({ url: 'not a url' }).errors).toEqual(['payload.url.invalid']);
    expect(buildUrl({ url: 'javascript:alert(1)' }).warnings).toEqual(['payload.url.dangerous']);
    expect(buildUrl({ url: 'ftp://example.com' }).warnings).toEqual(['payload.url.scheme']);
  });

  it('joins multiple URLs with newlines', () => {
    const p = buildMultiUrl({ urls: 'https://a.example\n\n https://b.example ' });
    expect(p.text).toBe('https://a.example\nhttps://b.example');
    expect(p.warnings).toContain('payload.multiUrl.readerNote');
  });

  it('builds tel and SMS', () => {
    expect(buildTel({ tel: '+81-3-1234-5678' }).text).toBe('tel:+81-3-1234-5678');
    expect(buildTel({ tel: '03(1234)' }).errors).toEqual(['payload.tel.invalid']);
    expect(buildSms({ tel: '09012345678', message: 'hi' }).text).toBe('SMSTO:09012345678:hi');
  });

  it('builds mailto and MATMSG with escaping', () => {
    expect(buildEmail({ to: 'a@b.jp', subject: 'Hi & bye', body: '', format: 'mailto' }).text).toBe('mailto:a@b.jp?subject=Hi%20%26%20bye');
    expect(buildEmail({ to: 'a@b.jp', subject: 'a;b', body: 'c:d', format: 'matmsg' }).text).toBe('MATMSG:TO:a@b.jp;SUB:a\\;b;BODY:c\\:d;;');
    expect(buildEmail({ to: 'nope', subject: '', body: '', format: 'mailto' }).errors).toEqual(['payload.email.invalid']);
  });

  it('escapes Wi-Fi special characters', () => {
    expect(buildWifi({ ssid: 'My;Net', password: 'p"a:ss\\', auth: 'WPA', hidden: true }).text).toBe(
      'WIFI:T:WPA;S:My\\;Net;P:p\\"a\\:ss\\\\;H:true;;',
    );
    expect(buildWifi({ ssid: 'Open', password: '', auth: 'nopass', hidden: false }).text).toBe('WIFI:T:nopass;S:Open;;');
    expect(buildWifi({ ssid: 'x', password: '', auth: 'WPA', hidden: false }).errors).toEqual(['payload.wifi.passwordRequired']);
  });

  it('builds vCard 3.0 with RFC escaping', () => {
    const text = buildVcard(contact).text!;
    expect(text.split('\r\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:山田;太郎;;;',
      'FN:太郎 山田',
      'ORG:ACME\\; Inc.',
      'TEL;TYPE=CELL:+81-90-1234-5678',
      'EMAIL:taro@example.com',
      'URL:https://example.com',
      'ADR:;;東京都\\, 千代田区;;;;',
      'NOTE:line1\\nline2',
      'END:VCARD',
    ]);
  });

  it('builds MECARD', () => {
    expect(buildMecard({ ...contact, note: '', address: '' }).text).toBe(
      'MECARD:N:山田,太郎;ORG:ACME\\; Inc.;TEL:+81-90-1234-5678;EMAIL:taro@example.com;URL:https\\://example.com;;',
    );
  });

  it('validates geo coordinates', () => {
    expect(buildGeo({ lat: '35.681', lng: '139.767', label: '東京駅' }).text).toBe(`geo:35.681,139.767?q=${encodeURIComponent('東京駅')}`);
    expect(buildGeo({ lat: '91', lng: '0', label: '' }).errors).toEqual(['payload.geo.lat']);
  });

  it('builds VEVENT', () => {
    const p = buildEvent({
      summary: 'Meet, greet',
      start: '2026-09-28T10:00',
      end: '2026-09-28T11:30',
      allDay: false,
      location: '',
      description: '',
    });
    expect(p.text).toBe('BEGIN:VEVENT\r\nSUMMARY:Meet\\, greet\r\nDTSTART:20260928T100000\r\nDTEND:20260928T113000\r\nEND:VEVENT');
    const allDay = buildEvent({ summary: 'x', start: '2026-09-28', end: '', allDay: true, location: '', description: '' });
    expect(allDay.text).toContain('DTSTART;VALUE=DATE:20260928');
    expect(buildEvent({ summary: 'x', start: '2026-09-28T10:00', end: '2026-09-27T10:00', allDay: false, location: '', description: '' }).errors).toEqual([
      'payload.event.endBeforeStart',
    ]);
  });

  it('parses GS1 AI strings and inserts separators after variable-length AIs', () => {
    const p = buildGs1({ value: '(01)04912345123459 (10)ABC123 (17)261231' });
    expect(p.text).toBe('0104912345123459' + '10ABC123\x1d' + '17261231');
    expect(p.fnc1).toBe(true);
    expect(p.warnings).toEqual([]);
    expect(buildGs1({ value: '(01)04912345123450' }).warnings).toEqual(['payload.gs1.checkDigit']);
    expect(buildGs1({ value: '01234' }).errors).toEqual(['payload.gs1.syntax']);
    expect(validGtinCheckDigit('04912345123459')).toBe(true);
  });

  it('parses hex', () => {
    expect(Array.from(parseHex('0a 1B,ff')!)).toEqual([10, 27, 255]);
    expect(Array.from(parseHex('0x01 0x02')!)).toEqual([1, 2]);
    expect(parseHex('abc')).toBeNull();
    expect(parseHex('zz')).toBeNull();
  });
});

describe('event time zones and WPA3', () => {
  const base = { summary: 'M', start: '2026-10-05T10:00', end: '2026-10-05T11:30', allDay: false, location: '', description: '' };

  it('keeps floating times unchanged by default', () => {
    expect(buildEvent(base).text).toContain('DTSTART:20261005T100000\r\nDTEND:20261005T113000');
  });

  it('converts a zoned wall-clock time to UTC', () => {
    expect(toIcalUtc('2026-10-05T10:00', 'Asia/Tokyo')).toBe('20261005T010000Z');
    expect(toIcalUtc('2026-01-01T00:30', 'Asia/Tokyo')).toBe('20251231T153000Z');
    expect(toIcalUtc('2026-10-05T10:00', 'UTC')).toBe('20261005T100000Z');
    const v = buildEvent({ ...base, timeZone: 'Asia/Tokyo' }).text;
    expect(v).toContain('DTSTART:20261005T010000Z\r\nDTEND:20261005T023000Z');
  });

  it('follows daylight saving time on both sides of a change', () => {
    // New York: EDT (UTC-4) until 1 Nov 2026 02:00, then EST (UTC-5).
    expect(toIcalUtc('2026-10-31T12:00', 'America/New_York')).toBe('20261031T160000Z');
    expect(toIcalUtc('2026-11-02T12:00', 'America/New_York')).toBe('20261102T170000Z');
    expect(toIcalUtc('2026-03-08T03:30', 'America/New_York')).toBe('20260308T073000Z');
  });

  it('ignores the time zone for all-day events', () => {
    expect(buildEvent({ ...base, allDay: true, timeZone: 'Asia/Tokyo' }).text).toContain('DTSTART;VALUE=DATE:20261005');
  });

  it('builds WPA3-only networks', () => {
    expect(buildWifi({ ssid: 'x', password: 'secret12', auth: 'SAE', hidden: false }).text).toBe('WIFI:T:SAE;S:x;P:secret12;;');
  });
});

describe('UTM parameters', () => {
  it('leaves the URL alone when nothing is filled in', () => {
    expect(buildUrl({ url: 'https://example.com', utm: { source: ' ' } }).text).toBe('https://example.com');
  });

  it('adds parameters and keeps the existing query and fragment', () => {
    expect(withUtm('https://example.com/a?x=1#top', { source: 'flyer', medium: 'qr', campaign: '秋 sale' })).toBe(
      'https://example.com/a?x=1&utm_source=flyer&utm_medium=qr&utm_campaign=%E7%A7%8B+sale#top',
    );
  });

  it('replaces an existing utm parameter', () => {
    expect(withUtm('https://example.com/?utm_source=old&b=2', { source: 'new' })).toBe('https://example.com/?utm_source=new&b=2');
  });

  it('does not add parameters to other schemes and says so', () => {
    const p = buildUrl({ url: 'mailto:a@example.com', utm: { source: 'x' } });
    expect(p.text).toBe('mailto:a@example.com');
    expect(p.warnings).toContain('payload.url.utmScheme');
  });
});

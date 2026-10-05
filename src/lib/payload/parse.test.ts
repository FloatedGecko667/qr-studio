import { describe, expect, it } from 'vitest';
import { buildEmail, buildEvent, buildGeo, buildMecard, buildSms, buildTel, buildVcard, buildWifi, type ContactFields } from './index';
import { contactToVcard, docomoFields, eventToIcs, icalToDate, links, parseScanned } from './parse';

const contact: ContactFields = {
  lastName: '山田',
  firstName: '太郎',
  org: 'Example; Inc.',
  title: '',
  tel: '+81-90-1234-5678',
  email: 'taro@example.com',
  url: 'https://example.com',
  address: '東京都千代田区1-1',
  note: 'a,b\nc',
};

describe('parseScanned: round trips with the generators', () => {
  it('Wi-Fi with escaped characters', () => {
    const text = buildWifi({ ssid: 'My;Net"1', password: 'p:a\\ss,', auth: 'WPA', hidden: true }).text!;
    expect(parseScanned(text)).toEqual({ kind: 'wifi', ssid: 'My;Net"1', password: 'p:a\\ss,', auth: 'WPA', hidden: true });
  });

  it('open Wi-Fi', () => {
    const text = buildWifi({ ssid: 'Cafe', password: '', auth: 'nopass', hidden: false }).text!;
    expect(parseScanned(text)).toMatchObject({ kind: 'wifi', ssid: 'Cafe', password: '', auth: 'nopass', hidden: false });
  });

  it('vCard', () => {
    const r = parseScanned(buildVcard(contact).text!);
    expect(r.kind).toBe('contact');
    if (r.kind !== 'contact') return;
    expect(r.contact).toMatchObject({
      name: '太郎 山田',
      org: 'Example; Inc.',
      tels: ['+81-90-1234-5678'],
      emails: ['taro@example.com'],
      url: 'https://example.com',
      address: '東京都千代田区1-1',
      note: 'a,b\nc',
    });
    expect(r.vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(r.vcard).toContain('ORG:Example\\; Inc.\r\n');
  });

  it('MeCard converts to a vCard file', () => {
    const r = parseScanned(buildMecard(contact).text!);
    expect(r).toMatchObject({ kind: 'contact', source: 'mecard', contact: { name: '太郎 山田', org: 'Example; Inc.', tels: ['+81-90-1234-5678'] } });
    if (r.kind === 'contact') expect(r.vcard).toContain('TEL:+81-90-1234-5678\r\n');
  });

  it('event', () => {
    const text = buildEvent({ summary: '会議, 定例', start: '2026-09-28T10:00', end: '2026-09-28T11:00', allDay: false, location: '本社', description: '' }).text!;
    expect(parseScanned(text)).toEqual({
      kind: 'event',
      event: { summary: '会議, 定例', start: '20260928T100000', end: '20260928T110000', location: '本社', description: '' },
    });
  });

  it('tel, SMS, mailto, MATMSG and geo', () => {
    expect(parseScanned(buildTel({ tel: '+81-3-1234-5678' }).text!)).toEqual({ kind: 'tel', number: '+81-3-1234-5678' });
    expect(parseScanned(buildSms({ tel: '09012345678', message: 'hi: there' }).text!)).toEqual({ kind: 'sms', number: '09012345678', message: 'hi: there' });
    expect(parseScanned(buildEmail({ to: 'a@b.jp', subject: '件名 & more', body: 'x', format: 'mailto' }).text!)).toEqual({
      kind: 'email',
      to: 'a@b.jp',
      subject: '件名 & more',
      body: 'x',
    });
    expect(parseScanned(buildEmail({ to: 'a@b.jp', subject: 'S;1', body: 'B', format: 'matmsg' }).text!)).toEqual({
      kind: 'email',
      to: 'a@b.jp',
      subject: 'S;1',
      body: 'B',
    });
    expect(parseScanned(buildGeo({ lat: '35.681236', lng: '139.767125', label: '東京駅' }).text!)).toEqual({
      kind: 'geo',
      lat: 35.681236,
      lng: 139.767125,
      label: '東京駅',
    });
  });
});

describe('parseScanned: other inputs', () => {
  it('recognises URLs and falls back to text', () => {
    expect(parseScanned('https://example.com/a?b=1')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1' });
    expect(parseScanned('hello')).toEqual({ kind: 'text' });
    expect(parseScanned('javascript:alert(1)')).toEqual({ kind: 'text' });
  });

  it('rejects malformed values instead of guessing', () => {
    expect(parseScanned('tel:javascript:alert(1)')).toEqual({ kind: 'text' });
    expect(parseScanned('mailto:not-an-address')).toEqual({ kind: 'text' });
    expect(parseScanned('WIFI:T:WPA;;')).toEqual({ kind: 'text' });
    expect(parseScanned('geo:95,10')).toEqual({ kind: 'text' });
    expect(parseScanned('BEGIN:VCARD\r\nEND:VCARD')).toEqual({ kind: 'text' });
  });

  it('accepts sms: URIs, folded vCard lines and VCALENDAR wrappers', () => {
    expect(parseScanned('sms:+819012345678?body=hello%20world')).toEqual({ kind: 'sms', number: '+819012345678', message: 'hello world' });
    const folded = parseScanned('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Long\r\n  Name\r\nEND:VCARD');
    expect(folded).toMatchObject({ contact: { name: 'Long Name' } });
    const cal = parseScanned('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:X\nDTSTART;VALUE=DATE:20261001\nEND:VEVENT\nEND:VCALENDAR');
    expect(cal).toMatchObject({ kind: 'event', event: { summary: 'X', start: '20261001' } });
  });
});

describe('helpers', () => {
  it('docomoFields keeps escaped separators', () => {
    expect(docomoFields(String.raw`S:a\;b;P:c\\;;`)).toEqual([
      ['S', 'a;b'],
      ['P', 'c\\'],
    ]);
  });

  it('eventToIcs writes a complete calendar', () => {
    const ics = eventToIcs({ summary: 'A;B', start: '20261001', end: '', location: '', description: '' }, 'id@qr', new Date(Date.UTC(2026, 8, 29, 1, 2, 3)));
    expect(ics).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//QR Studio//Scan//EN\r\nBEGIN:VEVENT\r\nUID:id@qr\r\nDTSTAMP:20260929T010203Z\r\nSUMMARY:A\\;B\r\nDTSTART;VALUE=DATE:20261001\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    );
  });

  it('icalToDate', () => {
    expect(icalToDate('20261001')).toMatchObject({ allDay: true, utc: false });
    expect(icalToDate('20261001T100000Z')?.date.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(icalToDate('tomorrow')).toBeNull();
  });

  it('links contain only validated characters', () => {
    expect(links.tel('+81 (90) 1234-5678')).toBe('tel:+819012345678');
    expect(links.sms('090-1', 'a&b')).toBe('sms:0901?body=a%26b');
    expect(links.mail('a@b.jp', 'x y', '')).toBe('mailto:a@b.jp?subject=x%20y');
    expect(contactToVcard({ name: 'A', org: '', title: '', tels: [], emails: [], url: '', address: '', note: '' })).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:A;;;;\r\nFN:A\r\nEND:VCARD\r\n',
    );
  });
});

describe('WPA3', () => {
  it('reads T:SAE as WPA3-only', () => {
    expect(parseScanned('WIFI:T:SAE;S:Home;P:pw;;')).toMatchObject({ kind: 'wifi', auth: 'SAE', ssid: 'Home' });
  });
});

import { describe, expect, it } from 'vitest';
import { parseCsv } from './batch';
import { guessFilenameColumn, guessMapping, itemsFromMapping, normalizeDateTime, rowFields } from './batchMap';
import { FORMS } from './payload/forms';

describe('guessMapping', () => {
  it('matches keys, labels and aliases in English and Japanese', () => {
    const header = ['SSID', 'パスワード', 'Security', 'ファイル名', 'Hidden'];
    const m = guessMapping('wifi', header);
    expect(m).toEqual({ ssid: 0, password: 1, auth: 2, hidden: 4 });
    expect(guessFilenameColumn(header, m)).toBe(3);
  });

  it('uses the on-screen label and never maps one column twice', () => {
    const m = guessMapping('vcard', ['姓', '名', '会社名', 'メール', 'Phone', 'Title'], (f) => ({ lastName: '姓', firstName: '名' })[f.key] ?? '');
    expect(m).toMatchObject({ lastName: 0, firstName: 1, org: 2, email: 3, tel: 4, title: 5 });
    // "title" is the event summary's alias too, but here it already belongs to the job title.
    const ev = guessMapping('event', ['Title', 'Start', 'End', 'Place']);
    expect(ev).toMatchObject({ summary: 0, start: 1, end: 2, location: 3, description: -1 });
  });

  it('leaves unknown headers unmapped', () => {
    expect(guessMapping('geo', ['foo', 'bar'])).toEqual({ lat: -1, lng: -1, label: -1 });
  });
});

describe('rowFields', () => {
  it('reads checkboxes, selects with synonyms, and dates', () => {
    expect(rowFields('wifi', ['Office', 'pw', 'WPA2', 'はい'], { ssid: 0, password: 1, auth: 2, hidden: 3 })).toEqual({
      ssid: 'Office',
      password: 'pw',
      auth: 'WPA',
      hidden: true,
    });
    expect(rowFields('wifi', ['Cafe', '', 'open', ''], { ssid: 0, password: 1, auth: 2, hidden: 3 })).toMatchObject({ auth: 'nopass', hidden: false });
    expect(rowFields('wifi', ['X', '', 'wpa3', ''], { ssid: 0, auth: 2 })).toMatchObject({ auth: 'SAE' });
    expect(rowFields('wifi', ['X', '', '???', ''], { ssid: 0, auth: 2 })).toMatchObject({ auth: 'WPA' });
    const ev = rowFields('event', ['会議', '2026/10/6 9:30', '2026-10-06 10:00', 'JST'], { summary: 0, start: 1, end: 2, timeZone: 3 });
    expect(ev).toMatchObject({ summary: '会議', start: '2026-10-06T09:30', end: '2026-10-06T10:00', timeZone: 'Asia/Tokyo', allDay: false });
  });

  it('builds valid payloads with the form definitions', () => {
    const f = rowFields('wifi', ['Office;5G', 's3cret'], { ssid: 0, password: 1 });
    expect(FORMS.wifi.build(f)).toMatchObject({ text: String.raw`WIFI:T:WPA;S:Office\;5G;P:s3cret;;`, errors: [] });
  });

  it('normalizes date and time notation', () => {
    expect(normalizeDateTime('2026/1/2')).toBe('2026-01-02');
    expect(normalizeDateTime('２０２６－１０－０６ ０９：０５')).toBe('2026-10-06T09:05');
    expect(normalizeDateTime('2026-10-06T09:05:30')).toBe('2026-10-06T09:05');
    expect(normalizeDateTime('tomorrow')).toBe('tomorrow');
  });
});

describe('itemsFromMapping', () => {
  it('skips empty rows, keeps source row numbers and names files', () => {
    const rows = parseCsv('ssid,password,filename\nA,1,shop/a\n,,\nB,2,\n');
    const items = itemsFromMapping(rows.slice(1), 'wifi', { ssid: 0, password: 1 }, 2, 'wifi');
    expect(items.map((i) => [i.row, i.filename, i.kind, i.fields?.ssid])).toEqual([
      [2, 'shop_a', 'wifi', 'A'],
      [4, 'wifi-0002', 'wifi', 'B'],
    ]);
  });
});

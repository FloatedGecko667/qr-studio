/**
 * Recognises the payload formats this app generates (and their common variants) in scanned
 * text, so the reader can offer the matching action. Everything is parsed locally; the caller
 * builds links only from the validated pieces, never from the raw text.
 */

import { parseDigitalLink, type AiPair } from './gs1';

export type WifiAuth = 'WPA' | 'SAE' | 'WEP' | 'nopass';

export interface Contact {
  name: string;
  org: string;
  title: string;
  tels: string[];
  emails: string[];
  url: string;
  address: string;
  note: string;
}

export interface CalendarEvent {
  summary: string;
  /** iCalendar date or date-time as written (e.g. 20260928 or 20260928T100000Z). */
  start: string;
  end: string;
  location: string;
  description: string;
}

export type Scanned =
  | { kind: 'url'; url: string; gs1: AiPair[] | null }
  | { kind: 'tel'; number: string }
  | { kind: 'sms'; number: string; message: string }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'wifi'; ssid: string; password: string; auth: WifiAuth; hidden: boolean }
  | { kind: 'contact'; source: 'vcard' | 'mecard'; contact: Contact; vcard: string }
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'geo'; lat: number; lng: number; label: string }
  | { kind: 'text' };

const PHONE_RE = /^\+?[0-9][0-9\-() ]*$/;
const EMAIL_RE = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

/** Splits a MECARD / WIFI / MATMSG body into fields, honouring backslash escapes. */
export function docomoFields(body: string): [string, string][] {
  const fields: [string, string][] = [];
  let key = '';
  let value = '';
  let inValue = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) {
      if (inValue) value += body[++i];
      else key += body[++i];
    } else if (!inValue && c === ':') {
      inValue = true;
    } else if (c === ';') {
      if (inValue) fields.push([key.toUpperCase(), value]);
      key = '';
      value = '';
      inValue = false;
    } else if (inValue) {
      value += c;
    } else {
      key += c;
    }
  }
  if (inValue) fields.push([key.toUpperCase(), value]);
  return fields;
}

const field = (fields: [string, string][], key: string) => fields.find(([k]) => k === key)?.[1] ?? '';
const all = (fields: [string, string][], key: string) => fields.filter(([k]) => k === key).map(([, v]) => v);

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Unfolds RFC 5545 / 6350 content lines and splits them into name, parameters and value. */
function contentLines(text: string): { name: string; params: string; value: string }[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  return unfolded
    .split(/\r?\n/)
    .map((line) => {
      const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      if (colon < 0) return null;
      const head = line.slice(0, colon);
      const semi = head.indexOf(';');
      const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
      return { name, params: semi < 0 ? '' : head.slice(semi + 1), value: line.slice(colon + 1) };
    })
    .filter((l): l is { name: string; params: string; value: string } => l !== null);
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Escapes a value for a vCard / iCalendar text property. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function parseVcard(text: string): Contact {
  const lines = contentLines(text);
  const get = (n: string) => lines.find((l) => l.name === n)?.value ?? '';
  const nameParts = get('N').split(/(?<!\\);/).map(unescapeText);
  const fn = unescapeText(get('FN'));
  const adr = get('ADR').split(/(?<!\\);/).map(unescapeText).filter(Boolean).join(' ');
  return {
    name: fn || [nameParts[1], nameParts[0]].filter(Boolean).join(' '),
    org: get('ORG').split(/(?<!\\);/).map(unescapeText).filter(Boolean).join(' '),
    title: unescapeText(get('TITLE')),
    tels: lines.filter((l) => l.name === 'TEL').map((l) => l.value.replace(/^tel:/i, '').trim()).filter(Boolean),
    emails: lines.filter((l) => l.name === 'EMAIL').map((l) => l.value.trim()).filter(Boolean),
    url: unescapeText(get('URL')).trim(),
    address: adr,
    note: unescapeText(get('NOTE')),
  };
}

function parseMecard(body: string): Contact {
  const f = docomoFields(body);
  const [last = '', first = ''] = field(f, 'N').split(',');
  return {
    name: [first, last].filter(Boolean).join(' ') || field(f, 'N'),
    org: field(f, 'ORG'),
    title: field(f, 'TITLE'),
    tels: all(f, 'TEL').filter(Boolean),
    emails: all(f, 'EMAIL').filter(Boolean),
    url: field(f, 'URL'),
    address: field(f, 'ADR'),
    note: field(f, 'NOTE'),
  };
}

/** A vCard 3.0 file for contacts apps (CRLF line endings, as RFC 2426 requires). */
export function contactToVcard(c: Contact): string {
  const e = escapeText;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(c.name)};;;;`, `FN:${e(c.name || c.org)}`];
  if (c.org) lines.push(`ORG:${e(c.org)}`);
  if (c.title) lines.push(`TITLE:${e(c.title)}`);
  for (const t of c.tels) lines.push(`TEL:${e(t)}`);
  for (const m of c.emails) lines.push(`EMAIL:${e(m)}`);
  if (c.url) lines.push(`URL:${e(c.url)}`);
  if (c.address) lines.push(`ADR:;;${e(c.address)};;;;`);
  if (c.note) lines.push(`NOTE:${e(c.note)}`);
  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

function parseEvent(text: string): CalendarEvent {
  const lines = contentLines(text);
  const get = (n: string) => unescapeText(lines.find((l) => l.name === n)?.value ?? '');
  return { summary: get('SUMMARY'), start: get('DTSTART'), end: get('DTEND'), location: get('LOCATION'), description: get('DESCRIPTION') };
}

function icsDate(value: string): string {
  return /^\d{8}$/.test(value) ? `;VALUE=DATE:${value}` : `:${value}`;
}

/** A complete iCalendar file (VCALENDAR with UID and DTSTAMP, per RFC 5545) for one event. */
export function eventToIcs(ev: CalendarEvent, uid: string, now: Date): string {
  const e = escapeText;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QR Studio//Scan//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${e(ev.summary)}`,
  ];
  if (ev.start) lines.push(`DTSTART${icsDate(ev.start)}`);
  if (ev.end) lines.push(`DTEND${icsDate(ev.end)}`);
  if (ev.location) lines.push(`LOCATION:${e(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${e(ev.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** "20260928T100000Z" → Date-like display parts; null when not an iCalendar date. */
export function icalToDate(value: string): { date: Date; allDay: boolean; utc: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((v) => Number(v ?? 0));
  const utc = m[7] === 'Z';
  const args = [y, mo - 1, d, h, mi, s] as const;
  const date = utc ? new Date(Date.UTC(...args)) : new Date(...args);
  return Number.isNaN(date.getTime()) ? null : { date, allDay: m[4] === undefined, utc };
}

function parseMailto(text: string): Scanned | null {
  const [addr, query = ''] = text.slice('mailto:'.length).split('?');
  const to = decode(addr).trim();
  if (!EMAIL_RE.test(to)) return null;
  const params = new URLSearchParams(query);
  return { kind: 'email', to, subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
}

export function parseScanned(raw: string): Scanned {
  const text = raw.trim();
  const upper = text.slice(0, 16).toUpperCase();

  if (/^https?:\/\/\S+$/i.test(text)) return { kind: 'url', url: text, gs1: parseDigitalLink(text) };

  if (upper.startsWith('TEL:')) {
    const number = decode(text.slice(4)).trim();
    return PHONE_RE.test(number) ? { kind: 'tel', number } : { kind: 'text' };
  }

  if (upper.startsWith('SMSTO:') || upper.startsWith('SMS:')) {
    const rest = text.slice(text.indexOf(':') + 1);
    let number: string;
    let message: string;
    if (upper.startsWith('SMSTO:')) {
      const colon = rest.indexOf(':');
      number = colon < 0 ? rest : rest.slice(0, colon);
      message = colon < 0 ? '' : rest.slice(colon + 1);
    } else {
      const [n, query = ''] = rest.split('?');
      number = decode(n);
      message = new URLSearchParams(query).get('body') ?? '';
    }
    number = number.trim();
    return PHONE_RE.test(number) ? { kind: 'sms', number, message } : { kind: 'text' };
  }

  if (upper.startsWith('MAILTO:')) return parseMailto(text) ?? { kind: 'text' };

  if (upper.startsWith('MATMSG:')) {
    const f = docomoFields(text.slice(7));
    const to = field(f, 'TO').trim();
    return EMAIL_RE.test(to) ? { kind: 'email', to, subject: field(f, 'SUB'), body: field(f, 'BODY') } : { kind: 'text' };
  }

  if (upper.startsWith('WIFI:')) {
    const f = docomoFields(text.slice(5));
    const ssid = field(f, 'S');
    if (!ssid) return { kind: 'text' };
    const t = field(f, 'T').toUpperCase();
    const auth: WifiAuth = t === 'WEP' ? 'WEP' : t === 'SAE' ? 'SAE' : t === '' || t === 'NOPASS' ? 'nopass' : 'WPA';
    return { kind: 'wifi', ssid, password: field(f, 'P'), auth, hidden: field(f, 'H').toLowerCase() === 'true' };
  }

  if (upper.startsWith('BEGIN:VCARD')) {
    const contact = parseVcard(text);
    if (!contact.name && !contact.org) return { kind: 'text' };
    return { kind: 'contact', source: 'vcard', contact, vcard: contactToVcard(contact) };
  }

  if (upper.startsWith('MECARD:')) {
    const contact = parseMecard(text.slice(7));
    if (!contact.name && !contact.org) return { kind: 'text' };
    return { kind: 'contact', source: 'mecard', contact, vcard: contactToVcard(contact) };
  }

  if (upper.startsWith('BEGIN:VEVENT') || upper.startsWith('BEGIN:VCALENDAR')) {
    const event = parseEvent(text);
    if (!event.summary && !event.start) return { kind: 'text' };
    return { kind: 'event', event };
  }

  if (upper.startsWith('GEO:')) {
    const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^?;]*)?(?:;[^?]*)?(?:\?(.*))?$/i.exec(text);
    if (!m) return { kind: 'text' };
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { kind: 'text' };
    return { kind: 'geo', lat, lng, label: new URLSearchParams(m[3] ?? '').get('q') ?? '' };
  }

  return { kind: 'text' };
}

/** Link targets built only from validated fields. */
export const links = {
  tel: (number: string) => `tel:${number.replace(/[^0-9+]/g, '')}`,
  sms: (number: string, message: string) => `sms:${number.replace(/[^0-9+]/g, '')}${message ? `?body=${encodeURIComponent(message)}` : ''}`,
  mail: (to: string, subject: string, body: string) => {
    const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
    return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}${q ? `?${q}` : ''}`;
  },
  geo: (lat: number, lng: number) => `geo:${lat},${lng}`,
  osm: (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
};

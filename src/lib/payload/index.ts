// Builders that turn form fields into the string (or bytes) stored in the symbol.
// Each builder returns i18n message keys for problems instead of display text.

export type PayloadKind =
  | 'url'
  | 'text'
  | 'multiUrl'
  | 'tel'
  | 'sms'
  | 'email'
  | 'wifi'
  | 'vcard'
  | 'mecard'
  | 'geo'
  | 'event'
  | 'gs1'
  | 'binary';

export const PAYLOAD_KINDS: readonly PayloadKind[] = [
  'url',
  'text',
  'multiUrl',
  'tel',
  'sms',
  'email',
  'wifi',
  'vcard',
  'mecard',
  'geo',
  'event',
  'gs1',
  'binary',
];

export interface Payload {
  text?: string;
  bytes?: Uint8Array;
  /** GS1 element string: encode with FNC1 in first position. */
  fnc1?: boolean;
  errors: string[];
  warnings: string[];
}

const ok = (text: string, warnings: string[] = []): Payload => ({ text, errors: [], warnings });
const fail = (...errors: string[]): Payload => ({ errors, warnings: [] });

/** Escapes `\ ; , :` (and `"` for Wi-Fi) with a backslash, as used by MECARD / WIFI / MATMSG. */
export function escapeDocomo(value: string, extra = ''): string {
  const special = new Set(['\\', ';', ',', ':', ...extra]);
  return Array.from(value, (c) => (special.has(c) ? `\\${c}` : c)).join('');
}

/** RFC 6350 / RFC 5545 text value escaping. */
export function escapeIcal(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const SAFE_SCHEMES = new Set(['http:', 'https:']);
const DANGEROUS_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:']);

export function checkUrl(value: string): { errors: string[]; warnings: string[] } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { errors: ['payload.url.invalid'], warnings: [] };
  }
  if (DANGEROUS_SCHEMES.has(url.protocol)) return { errors: [], warnings: ['payload.url.dangerous'] };
  if (!SAFE_SCHEMES.has(url.protocol)) return { errors: [], warnings: ['payload.url.scheme'] };
  return { errors: [], warnings: [] };
}

export function buildUrl(f: { url: string }): Payload {
  const url = f.url.trim();
  if (!url) return fail('payload.required');
  const { errors, warnings } = checkUrl(url);
  return errors.length ? fail(...errors) : ok(url, warnings);
}

export function buildText(f: { text: string }): Payload {
  return f.text ? ok(f.text) : fail('payload.required');
}

export function buildMultiUrl(f: { urls: string }): Payload {
  const lines = f.urls
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return fail('payload.required');
  const warnings = new Set<string>(['payload.multiUrl.readerNote']);
  for (const l of lines) {
    const r = checkUrl(l);
    if (r.errors.length) return fail(...r.errors);
    r.warnings.forEach((w) => warnings.add(w));
  }
  return ok(lines.join('\n'), [...warnings]);
}

const PHONE_RE = /^\+?[0-9][0-9-]*$/;

export function buildTel(f: { tel: string }): Payload {
  const tel = f.tel.trim();
  if (!tel) return fail('payload.required');
  if (!PHONE_RE.test(tel)) return fail('payload.tel.invalid');
  return ok(`tel:${tel}`);
}

export function buildSms(f: { tel: string; message: string }): Payload {
  const tel = f.tel.trim();
  if (!tel) return fail('payload.required');
  if (!PHONE_RE.test(tel)) return fail('payload.tel.invalid');
  return ok(f.message ? `SMSTO:${tel}:${f.message}` : `SMSTO:${tel}`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildEmail(f: { to: string; subject: string; body: string; format: 'mailto' | 'matmsg' }): Payload {
  const to = f.to.trim();
  if (!to) return fail('payload.required');
  if (!EMAIL_RE.test(to)) return fail('payload.email.invalid');
  if (f.format === 'matmsg') {
    return ok(`MATMSG:TO:${escapeDocomo(to)};SUB:${escapeDocomo(f.subject)};BODY:${escapeDocomo(f.body)};;`);
  }
  const params: string[] = [];
  if (f.subject) params.push(`subject=${encodeURIComponent(f.subject)}`);
  if (f.body) params.push(`body=${encodeURIComponent(f.body)}`);
  return ok(`mailto:${to}${params.length ? `?${params.join('&')}` : ''}`);
}

export type WifiAuth = 'WPA' | 'WEP' | 'nopass';

export function buildWifi(f: { ssid: string; password: string; auth: WifiAuth; hidden: boolean }): Payload {
  if (!f.ssid) return fail('payload.wifi.ssidRequired');
  if (f.auth !== 'nopass' && !f.password) return fail('payload.wifi.passwordRequired');
  const e = (v: string) => escapeDocomo(v, '"');
  let s = `WIFI:T:${f.auth};S:${e(f.ssid)};`;
  if (f.auth !== 'nopass') s += `P:${e(f.password)};`;
  if (f.hidden) s += 'H:true;';
  return ok(`${s};`);
}

export interface ContactFields {
  lastName: string;
  firstName: string;
  org: string;
  title: string;
  tel: string;
  email: string;
  url: string;
  address: string;
  note: string;
}

function contactErrors(f: ContactFields): string[] {
  if (!f.lastName && !f.firstName && !f.org) return ['payload.contact.nameRequired'];
  if (f.tel && !PHONE_RE.test(f.tel.trim())) return ['payload.tel.invalid'];
  if (f.email && !EMAIL_RE.test(f.email.trim())) return ['payload.email.invalid'];
  return [];
}

export function buildVcard(f: ContactFields): Payload {
  const errors = contactErrors(f);
  if (errors.length) return fail(...errors);
  const e = escapeIcal;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(f.lastName)};${e(f.firstName)};;;`];
  lines.push(`FN:${e([f.firstName, f.lastName].filter(Boolean).join(' ') || f.org)}`);
  if (f.org) lines.push(`ORG:${e(f.org)}`);
  if (f.title) lines.push(`TITLE:${e(f.title)}`);
  if (f.tel) lines.push(`TEL;TYPE=CELL:${f.tel.trim()}`);
  if (f.email) lines.push(`EMAIL:${f.email.trim()}`);
  if (f.url) lines.push(`URL:${e(f.url.trim())}`);
  if (f.address) lines.push(`ADR:;;${e(f.address)};;;;`);
  if (f.note) lines.push(`NOTE:${e(f.note)}`);
  lines.push('END:VCARD');
  return ok(lines.join('\r\n'));
}

export function buildMecard(f: ContactFields): Payload {
  const errors = contactErrors(f);
  if (errors.length) return fail(...errors);
  const e = (v: string) => escapeDocomo(v);
  const name = [f.lastName, f.firstName].filter(Boolean).map(e).join(',') || e(f.org);
  let s = `MECARD:N:${name};`;
  if (f.org) s += `ORG:${e(f.org)};`;
  if (f.tel) s += `TEL:${f.tel.trim()};`;
  if (f.email) s += `EMAIL:${e(f.email.trim())};`;
  if (f.url) s += `URL:${e(f.url.trim())};`;
  if (f.address) s += `ADR:${e(f.address)};`;
  if (f.note) s += `NOTE:${e(f.note)};`;
  return ok(`${s};`);
}

export function buildGeo(f: { lat: string; lng: string; label: string }): Payload {
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  if (f.lat.trim() === '' || f.lng.trim() === '') return fail('payload.required');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return fail('payload.geo.lat');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return fail('payload.geo.lng');
  const q = f.label ? `?q=${encodeURIComponent(f.label)}` : '';
  return ok(`geo:${lat},${lng}${q}`);
}

/** "2026-09-28T10:00" -> "20260928T100000"; "2026-09-28" -> "20260928". */
export function toIcalDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  return m[4] ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : `${m[1]}${m[2]}${m[3]}`;
}

export function buildEvent(f: {
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
}): Payload {
  if (!f.summary) return fail('payload.event.summaryRequired');
  const start = toIcalDate(f.allDay ? f.start.slice(0, 10) : f.start);
  const end = f.end ? toIcalDate(f.allDay ? f.end.slice(0, 10) : f.end) : null;
  if (!start) return fail('payload.event.startRequired');
  if (f.end && !end) return fail('payload.event.endInvalid');
  if (end && end < start) return fail('payload.event.endBeforeStart');
  const prop = f.allDay ? ';VALUE=DATE' : '';
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeIcal(f.summary)}`, `DTSTART${prop}:${start}`];
  if (end) lines.push(`DTEND${prop}:${end}`);
  if (f.location) lines.push(`LOCATION:${escapeIcal(f.location)}`);
  if (f.description) lines.push(`DESCRIPTION:${escapeIcal(f.description)}`);
  lines.push('END:VEVENT');
  return ok(lines.join('\r\n'));
}

// GS1 General Specifications 7.8.5: AIs starting with these digits have a predefined length,
// so no FNC1 separator is needed after them.
const GS1_PREDEFINED = new Set([
  '00', '01', '02', '03', '04', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '31', '32', '33', '34', '35', '36', '41',
]);

/** Parses "(01)04912345123459(10)ABC" into a GS1 element string with GS separators. */
export function buildGs1(f: { value: string }): Payload {
  const src = f.value.replace(/\s+/g, '');
  if (!src) return fail('payload.required');
  const re = /\((\d{2,4})\)([^()]+)/gy;
  const parts: [string, string][] = [];
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(src))) {
    parts.push([m[1], m[2]]);
    consumed = re.lastIndex;
  }
  if (parts.length === 0 || consumed !== src.length) return fail('payload.gs1.syntax');
  const warnings: string[] = [];
  let out = '';
  parts.forEach(([ai, value], i) => {
    if (ai === '01' && (value.length !== 14 || !/^\d+$/.test(value) || !validGtinCheckDigit(value))) {
      warnings.push('payload.gs1.checkDigit');
    }
    out += ai + value;
    if (i < parts.length - 1 && !GS1_PREDEFINED.has(ai.slice(0, 2))) out += '\x1d';
  });
  return { text: out, fnc1: true, errors: [], warnings };
}

export function validGtinCheckDigit(digits: string): boolean {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Parses hex like "0a 1B ff" or "0x0a,0x1b". */
export function parseHex(value: string): Uint8Array | null {
  const clean = value.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function buildBinary(f: { hex: string; file: Uint8Array | null; source: 'hex' | 'file' }): Payload {
  if (f.source === 'file') {
    if (!f.file || f.file.length === 0) return fail('payload.binary.fileRequired');
    return { bytes: f.file, errors: [], warnings: [] };
  }
  if (!f.hex.trim()) return fail('payload.required');
  const bytes = parseHex(f.hex);
  if (!bytes) return fail('payload.binary.hexInvalid');
  return { bytes, errors: [], warnings: [] };
}

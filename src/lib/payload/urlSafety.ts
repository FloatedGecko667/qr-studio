// Signs that a scanned link may not go where it seems to. Everything is decided on the device
// from the URL itself; nothing is looked up.

export type UrlWarning = 'http' | 'idn' | 'ip' | 'userinfo' | 'shortener';

export interface UrlSafety {
  /** Host as the browser will contact it (internationalised labels in xn-- form). */
  host: string;
  /** Unicode form of an internationalised host, as people see it; null for plain ASCII hosts. */
  unicodeHost: string | null;
  /** user[:password] before "@", which is not the destination. */
  userinfo: string;
  warnings: UrlWarning[];
}

/** Common public link shorteners: the real destination is only known after opening the link. */
const SHORTENERS = new Set([
  'bit.ly',
  'bitly.com',
  'buff.ly',
  'cutt.ly',
  'goo.gl',
  'is.gd',
  'lnkd.in',
  'ow.ly',
  'qrco.de',
  'rb.gy',
  'rebrand.ly',
  's.id',
  'shorturl.at',
  't.co',
  't.ly',
  'tiny.cc',
  'tinyurl.com',
  'v.gd',
  'x.gd',
]);

/** Punycode (RFC 3492) decoding of one label without its "xn--" prefix; null if malformed. */
export function decodePunycode(input: string): string | null {
  const base = 36;
  const tMin = 1;
  const tMax = 26;
  const delimiter = input.lastIndexOf('-');
  const output: number[] = [];
  for (let j = 0; j < Math.max(delimiter, 0); j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) return null;
    output.push(c);
  }
  let n = 128;
  let i = 0;
  let bias = 72;
  for (let pos = delimiter > 0 ? delimiter + 1 : 0; pos < input.length; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (pos >= input.length) return null;
      const c = input.charCodeAt(pos++);
      const digit = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : base;
      if (digit >= base) return null;
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    const len = output.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    if (n > 0x10ffff) return null;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

function adapt(delta: number, numPoints: number, first: boolean): number {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > 455) {
    d = Math.floor(d / 35);
    k += 36;
  }
  return k + Math.floor((36 * d) / (d + 38));
}

/** Host in Unicode, or null when no label is internationalised (or one cannot be decoded). */
export function toUnicodeHost(host: string): string | null {
  const labels = host.split('.');
  if (!labels.some((l) => l.toLowerCase().startsWith('xn--'))) return null;
  const out: string[] = [];
  for (const l of labels) {
    if (!l.toLowerCase().startsWith('xn--')) {
      out.push(l);
      continue;
    }
    const decoded = decodePunycode(l.slice(4));
    if (decoded === null) return null;
    out.push(decoded);
  }
  return out.join('.');
}

const isIp = (host: string) => host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

/** Safety facts for an http(s) URL; null if it does not parse. */
export function urlSafety(url: string): UrlSafety | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  // The URL parser already converts Unicode hosts to xn-- and odd IPv4 forms (0x7f.1, 2130706433) to dotted.
  const host = u.hostname;
  const unicodeHost = toUnicodeHost(host);
  const userinfo = u.username || u.password ? decodeURIComponent(u.password ? `${u.username}:${u.password}` : u.username) : '';
  const warnings: UrlWarning[] = [];
  if (u.protocol === 'http:') warnings.push('http');
  if (userinfo) warnings.push('userinfo');
  if (isIp(host)) warnings.push('ip');
  if (unicodeHost) warnings.push('idn');
  if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('shortener');
  return { host, unicodeHost, userinfo, warnings };
}

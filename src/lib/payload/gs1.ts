// GS1 element strings and GS1 Digital Link URIs (GS1 Digital Link Standard: URI Syntax 1.4).

export type AiPair = [ai: string, value: string];

/** Parses "(01)04912345123459(10)ABC" into AI/value pairs, or null on a syntax error. */
export function parseAiString(input: string): AiPair[] | null {
  const src = input.replace(/\s+/g, '');
  const re = /\((\d{2,4})\)([^()]+)/gy;
  const parts: AiPair[] = [];
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(src))) {
    parts.push([m[1], m[2]]);
    consumed = re.lastIndex;
  }
  return parts.length && consumed === src.length ? parts : null;
}

/**
 * Primary identification keys and their key qualifiers, in path order. A Digital Link path is
 * /{key}/{value} followed by the qualifiers that are present; all other AIs go to the query.
 */
export const DL_KEYS: Readonly<Record<string, readonly string[]>> = {
  '01': ['22', '10', '21'],
  '00': [],
  '253': [],
  '255': [],
  '401': [],
  '402': [],
  '414': ['254'],
  '417': [],
  '8003': [],
  '8004': [],
  '8006': ['22', '10', '21'],
  '8010': ['8011'],
  '8017': ['8019'],
  '8018': ['8019'],
};

/** AIs whose value is numeric and fixed-length, checked before building a link. */
const NUMERIC_LENGTH: Readonly<Record<string, number>> = { '00': 18, '01': 14, '414': 13, '417': 13, '8017': 18, '8018': 18 };

/** Percent-encodes a path segment or query value (RFC 3986 unreserved characters stay as they are). */
export function encodeDl(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type DigitalLinkResult = { ok: true; url: string; warnings: string[] } | { ok: false; error: string };

/** GTIN-8/12/13 are written as GTIN-14 in Digital Link paths. */
const toGtin14 = (v: string) => (/^\d{8}$|^\d{12,13}$/.test(v) ? v.padStart(14, '0') : v);

export function buildDigitalLink(pairs: readonly AiPair[], domain: string): DigitalLinkResult {
  let base: URL;
  try {
    base = new URL(domain.trim() || 'https://id.gs1.org');
  } catch {
    return { ok: false, error: 'payload.gs1dl.domain' };
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return { ok: false, error: 'payload.gs1dl.domain' };
  if (base.search || base.hash) return { ok: false, error: 'payload.gs1dl.domain' };

  const keyIndex = pairs.findIndex(([ai]) => ai in DL_KEYS);
  if (keyIndex < 0) return { ok: false, error: 'payload.gs1dl.noKey' };
  const values = new Map<string, string>();
  for (const [ai, v] of pairs) {
    if (values.has(ai)) return { ok: false, error: 'payload.gs1dl.duplicate' };
    values.set(ai, ai === '01' || ai === '8006' ? toGtin14(v) : v);
  }
  const key = pairs[keyIndex][0];
  for (const [ai, len] of Object.entries(NUMERIC_LENGTH)) {
    const v = values.get(ai);
    if (v !== undefined && (v.length !== len || !/^\d+$/.test(v))) return { ok: false, error: 'payload.gs1dl.keyFormat' };
  }
  // Another primary key cannot be in the same link.
  if (pairs.some(([ai], i) => i !== keyIndex && ai in DL_KEYS)) return { ok: false, error: 'payload.gs1dl.twoKeys' };

  const path = [key, ...DL_KEYS[key].filter((q) => values.has(q))];
  const segments = path.map((ai) => `/${ai}/${encodeDl(values.get(ai)!)}`).join('');
  const query = pairs
    .filter(([ai]) => !path.includes(ai))
    .map(([ai]) => `${ai}=${encodeDl(values.get(ai)!)}`)
    .join('&');
  const prefix = base.href.replace(/\/+$/, '');
  const warnings: string[] = [];
  if (key === '01' && !validCheckDigit(values.get('01')!)) warnings.push('payload.gs1.checkDigit');
  return { ok: true, url: `${prefix}${segments}${query ? `?${query}` : ''}`, warnings };
}

export function validCheckDigit(digits: string): boolean {
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * Reads the GS1 data out of a Digital Link URL (any domain): the primary key and qualifiers from
 * the path, other AIs from the query. Returns null when the URL is not a Digital Link.
 */
export function parseDigitalLink(url: string): AiPair[] | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const segs = u.pathname.split('/').filter(Boolean);
  // The key may follow a custom path prefix; find the first known key followed by a value.
  for (let start = 0; start + 1 < segs.length; start++) {
    const key = segs[start];
    if (!(key in DL_KEYS)) continue;
    const rest = segs.slice(start);
    if (rest.length % 2) continue;
    const pairs: AiPair[] = [];
    let ok = true;
    for (let i = 0; i < rest.length; i += 2) {
      const ai = rest[i];
      if (i > 0 && !DL_KEYS[key].includes(ai)) {
        ok = false;
        break;
      }
      let value: string;
      try {
        value = decodeURIComponent(rest[i + 1]);
      } catch {
        ok = false;
        break;
      }
      pairs.push([ai, value]);
    }
    if (!ok) continue;
    const len = NUMERIC_LENGTH[key];
    if (len && (pairs[0][1].length !== len || !/^\d+$/.test(pairs[0][1]))) continue;
    for (const [ai, value] of u.searchParams) {
      if (/^\d{2,4}$/.test(ai)) pairs.push([ai, value]);
    }
    return pairs;
  }
  return null;
}

/** Display names (i18n keys under `gs1ai.`) for the AIs people meet most. */
export const AI_NAMES = new Set(['00', '01', '10', '11', '13', '15', '16', '17', '21', '22', '30', '37', '414', '254', '3103', '8008']);

/** "YYMMDD" AIs (dates) shown as YYYY-MM-DD; DD 00 means the end of the month. */
export function gs1Date(ai: string, value: string): string | null {
  if (!['11', '12', '13', '15', '16', '17'].includes(ai) || !/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  // GS1 General Specifications 7.12: a year is chosen within -49/+50 years of the current one.
  const now = new Date().getFullYear();
  let year = Math.floor(now / 100) * 100 + yy;
  if (year - now > 50) year -= 100;
  else if (now - year > 49) year += 100;
  return `${year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
}

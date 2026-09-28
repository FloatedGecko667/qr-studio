import { deflateSync, inflateSync } from 'fflate';
import { buildMecard, buildVcard, type Payload, type PayloadKind } from './payload';
import { FORMS, contactFields, type FormValues } from './payload/forms';

export interface OptimizeSettings {
  /** A: uppercase scheme and host of http(s) URLs so they fit alphanumeric mode. */
  uppercaseUrl: boolean;
  /** B: convert full-width ASCII (U+FF01-FF5E) and the ideographic space to half-width. */
  halfwidth: boolean;
  /** C: vCard → MeCard when possible, otherwise a vCard without optional parameters. */
  compactContact: boolean;
  /** D: deflate when smaller; only readable by QR Studio's scanner. */
  deflate: boolean;
}

export const DEFAULT_OPTIMIZE: OptimizeSettings = {
  uppercaseUrl: false,
  halfwidth: false,
  compactContact: false,
  deflate: false,
};

/** Kinds whose text must not change (credentials, element strings, raw bytes). */
const NO_HALFWIDTH: readonly PayloadKind[] = ['wifi', 'gs1', 'binary'];
const URL_KINDS: readonly PayloadKind[] = ['url', 'multiUrl', 'text'];

/**
 * Uppercases the ASCII letters of the scheme and host of an http(s) URL. Userinfo, path,
 * query and fragment can be case-sensitive and are left untouched.
 */
export function uppercaseUrl(url: string): string {
  const m = /^(https?:\/\/)([^/?#]*)(.*)$/is.exec(url);
  if (!m) return url;
  const up = (s: string) => s.replace(/[a-z]/g, (c) => c.toUpperCase());
  const at = m[2].lastIndexOf('@');
  const authority = at >= 0 ? m[2].slice(0, at + 1) + up(m[2].slice(at + 1)) : up(m[2]);
  return up(m[1]) + authority + m[3];
}

export function toHalfwidth(text: string): string {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}

/** "QZ" + format version 1, followed by raw deflate of the UTF-8 text. */
export const DEFLATE_MAGIC = Uint8Array.of(0x51, 0x5a, 0x01);

export function compressText(text: string): Uint8Array {
  const body = deflateSync(new TextEncoder().encode(text), { level: 9 });
  const out = new Uint8Array(DEFLATE_MAGIC.length + body.length);
  out.set(DEFLATE_MAGIC);
  out.set(body, DEFLATE_MAGIC.length);
  return out;
}

/** Returns the original text for QR Studio compressed data, or null for anything else. */
export function decompressText(bytes: Uint8Array): string | null {
  if (bytes.length <= DEFLATE_MAGIC.length || !DEFLATE_MAGIC.every((b, i) => bytes[i] === b)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(inflateSync(bytes.subarray(DEFLATE_MAGIC.length)));
  } catch {
    return null;
  }
}

/** Builds the payload for `kind` and applies the enabled size optimizations. */
export function buildOptimized(kind: PayloadKind, fields: FormValues, opt: OptimizeSettings): Payload {
  let p: Payload;
  if (opt.compactContact && kind === 'vcard') {
    const c = contactFields(fields);
    // MeCard has no job title field; keep vCard then, just without optional parameters.
    p = c.title ? buildVcard(c, true) : buildMecard(c);
  } else {
    p = FORMS[kind].build(fields);
  }
  if (p.text === undefined || p.errors.length) return p;
  let text = p.text;
  const applied: string[] = [];
  if (opt.halfwidth && !NO_HALFWIDTH.includes(kind)) {
    const t = toHalfwidth(text);
    if (t !== text) applied.push('halfwidth');
    text = t;
  }
  if (opt.uppercaseUrl && URL_KINDS.includes(kind)) {
    const t = text
      .split('\n')
      .map((line) => uppercaseUrl(line))
      .join('\n');
    if (t !== text) applied.push('uppercaseUrl');
    text = t;
  }
  if (opt.compactContact && (kind === 'vcard' || kind === 'mecard')) applied.push('compactContact');
  const compressed = opt.deflate && !p.fnc1 ? compressText(text) : undefined;
  return { ...p, text, compressed, applied };
}

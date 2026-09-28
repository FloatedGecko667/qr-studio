// Image payloads: text encodings (Base64 data URL, Base45) and detection on the reading side.
import { ALNUM_CHARS } from './encoder/chars';

export type ImageEncoding = 'binary' | 'base64' | 'base45';

/** RFC 9285 Base45; its alphabet equals the QR alphanumeric set, so it encodes in alphanumeric mode. */
export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    let n = bytes[i] * 256 + bytes[i + 1];
    const c = n % 45;
    n = (n - c) / 45;
    out += ALNUM_CHARS[c] + ALNUM_CHARS[n % 45] + ALNUM_CHARS[Math.floor(n / 45)];
  }
  if (bytes.length % 2) {
    const n = bytes[bytes.length - 1];
    out += ALNUM_CHARS[n % 45] + ALNUM_CHARS[Math.floor(n / 45)];
  }
  return out;
}

export function base45Decode(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const values: number[] = [];
  for (const ch of text) {
    const v = ALNUM_CHARS.indexOf(ch);
    if (v < 0) return null;
    values.push(v);
  }
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 3) {
    if (i + 2 < values.length) {
      const n = values[i] + values[i + 1] * 45 + values[i + 2] * 2025;
      if (n > 0xffff) return null;
      out.push(n >> 8, n & 0xff);
    } else {
      const n = values[i] + values[i + 1] * 45;
      if (n > 0xff) return null;
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function dataUrlPrefix(mime: string): string {
  return `data:${mime};base64,`;
}

/** Text or bytes stored in the symbol for an image. */
export function encodeImage(bytes: Uint8Array, mime: string, encoding: ImageEncoding): { text?: string; bytes?: Uint8Array } {
  if (encoding === 'base64') return { text: dataUrlPrefix(mime) + toBase64(bytes) };
  if (encoding === 'base45') return { text: base45Encode(bytes) };
  return { bytes };
}

/** Identifies an image by its file signature. */
export function sniffImage(b: Uint8Array): string | null {
  const at = (i: number, ...sig: number[]) => sig.every((v, k) => b[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(4, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66)) return 'image/avif';
  return null;
}

export interface DetectedImage {
  bytes: Uint8Array;
  mime: string;
  encoding: ImageEncoding;
}

/** Finds an image in scanned data: raw bytes, a Base64 data URL, bare Base64, or Base45. */
export function detectImage(bytes: Uint8Array, text: string): DetectedImage | null {
  const raw = sniffImage(bytes);
  if (raw) return { bytes, mime: raw, encoding: 'binary' };
  const t = text.trim();
  const dataUrl = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(t);
  const b64 = dataUrl ? dataUrl[1] : /^[A-Za-z0-9+/=\s]{16,}$/.test(t) ? t : null;
  if (b64) {
    const decoded = fromBase64(b64.replace(/\s+/g, ''));
    const mime = decoded && sniffImage(decoded);
    if (decoded && mime) return { bytes: decoded, mime, encoding: 'base64' };
  }
  const b45 = base45Decode(t);
  const mime45 = b45 && sniffImage(b45);
  if (b45 && mime45) return { bytes: b45, mime: mime45, encoding: 'base45' };
  return null;
}

export function extensionForMime(mime: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] ?? 'bin';
}

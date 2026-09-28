// Removes metadata that canvas encoders add (ICC profile, EXIF, XMP). Canvas output is sRGB,
// which decoders assume when no profile is present, so pixels look the same without it.

const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

const WEBP_DROP = new Set(['ICCP', 'EXIF', 'XMP ']);
// VP8X flag bits: ICC profile, EXIF, XMP.
const VP8X_META_FLAGS = 0x20 | 0x08 | 0x04;

export function stripWebp(b: Uint8Array): Uint8Array {
  if (b.length < 20 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WEBP') return b;
  const chunks: { id: string; data: Uint8Array }[] = [];
  for (let i = 12; i + 8 <= b.length; ) {
    const len = u32le(b, i + 4);
    const end = i + 8 + len + (len & 1);
    if (end > b.length) return b;
    chunks.push({ id: tag(b, i), data: b.subarray(i, end) });
    i = end;
  }
  let kept = chunks.filter((c) => !WEBP_DROP.has(c.id));
  if (kept.length === chunks.length) return b;
  const vp8x = kept.find((c) => c.id === 'VP8X');
  if (vp8x) {
    const needsExtended = kept.some((c) => c.id === 'ALPH' || c.id === 'ANIM');
    if (needsExtended) {
      const copy = vp8x.data.slice();
      copy[8] &= ~VP8X_META_FLAGS;
      kept = kept.map((c) => (c === vp8x ? { id: c.id, data: copy } : c));
    } else {
      kept = kept.filter((c) => c !== vp8x);
    }
  }
  const body = kept.reduce((n, c) => n + c.data.length, 0);
  const out = new Uint8Array(12 + body);
  out.set(b.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body, true);
  let o = 12;
  for (const c of kept) {
    out.set(c.data, o);
    o += c.data.length;
  }
  return out;
}

export function stripJpeg(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda) break; // Start of scan: the rest is entropy-coded data.
    const len = (b[i + 2] << 8) | b[i + 3];
    const end = i + 2 + len;
    if (end > b.length) return b;
    // Drop APP1 (EXIF/XMP), APP2 (ICC) ... APP15 and comments; keep APP0 (JFIF) and tables.
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(b.subarray(i, end));
    i = end;
  }
  if (i >= b.length || b[i] !== 0xff || b[i + 1] !== 0xda) return b;
  parts.push(b.subarray(i));
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total === b.length) return b;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array {
  if (mime === 'image/webp') return stripWebp(bytes);
  if (mime === 'image/jpeg') return stripJpeg(bytes);
  return bytes;
}

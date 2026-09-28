import type { HistoryEntry } from './records';

// JSON export/import for history. Imported files are untrusted: every field is validated
// and anything unexpected is dropped rather than stored.

const FORMAT = 'qr-studio-history';
const VERSION = 1;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeValue(v: unknown): unknown {
  return v instanceof Uint8Array ? { $bytes: toBase64(v) } : v;
}

function decodeValue(v: unknown): unknown {
  if (v && typeof v === 'object' && '$bytes' in v && typeof (v as { $bytes: unknown }).$bytes === 'string') {
    return fromBase64((v as { $bytes: string }).$bytes);
  }
  return v;
}

export function exportHistory(entries: HistoryEntry[]): string {
  const items = entries.map((e) => ({
    ...e,
    fields: Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, encodeValue(v)])),
  }));
  return JSON.stringify({ format: FORMAT, version: VERSION, items });
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v) || v === null;

function cleanRecord(v: unknown, allowBytes: boolean): Record<string, unknown> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(v)) {
    const val = allowBytes ? decodeValue(raw) : raw;
    if (isPrimitive(val) || (allowBytes && val instanceof Uint8Array)) out[k] = val;
  }
  return out;
}

/** Returns validated entries, or null when the file is not a history export. */
export function parseHistory(json: string): HistoryEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.format !== FORMAT || !Array.isArray(data.items)) return null;
  const out: HistoryEntry[] = [];
  for (const item of data.items) {
    if (!isRecord(item)) continue;
    const fields = cleanRecord(item.fields, true);
    const symbol = cleanRecord(item.symbol, false);
    const style = cleanRecord(item.style, false);
    const logo = item.logoDataUrl;
    if (!fields || !symbol || !style) continue;
    if (typeof item.id !== 'string' || typeof item.kind !== 'string' || typeof item.createdAt !== 'number') continue;
    out.push({
      id: item.id.slice(0, 64),
      createdAt: item.createdAt,
      kind: item.kind,
      fields,
      symbol,
      style,
      logoDataUrl: typeof logo === 'string' && logo.startsWith('data:image/png;base64,') ? logo : null,
      summary: typeof item.summary === 'string' ? item.summary.slice(0, 200) : '',
    });
  }
  return out;
}

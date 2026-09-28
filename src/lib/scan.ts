import { Inflate } from 'fflate';
import { decompressText, DEFLATE_MAGIC } from './optimize';

/** Subset of zxing-wasm's ReadResult the scanner relies on. */
export interface ScannedSymbol {
  text: string;
  bytes: Uint8Array;
  format: string;
  sequenceSize: number;
  sequenceIndex: number;
  sequenceId: string;
}

export interface ScanOutcome {
  text: string;
  format: string;
  compressed: boolean;
  /** Number of structured-append symbols merged (1 for a single symbol). */
  parts: number;
  /** Raw payload bytes (merged for structured append). */
  bytes: Uint8Array;
}

/** Incomplete sequences kept at once (in memory and in IndexedDB). */
export const PARTIAL_LIMIT = 10;

/** An incomplete structured-append sequence; plain data so it can be stored in IndexedDB. */
export interface PartialSequence {
  /** `${format}/${sequenceId}/${total}` (for QR the sequence id is the parity byte). */
  key: string;
  sequenceId: string;
  total: number;
  format: string;
  /** Payload bytes by 0-based position. */
  parts: Record<number, Uint8Array>;
  /** Position read most recently (0-based). */
  last: number;
  updatedAt: number;
}

/** Decodes merged bytes: QR Studio deflate first, then UTF-8, then Shift_JIS. */
export function decodeBytes(bytes: Uint8Array): { text: string; compressed: boolean } {
  const inflated = decompressText(bytes);
  if (inflated !== null) return { text: inflated, compressed: true };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), compressed: false };
  } catch {
    return { text: new TextDecoder('shift_jis').decode(bytes), compressed: false };
  }
}

export const received = (s: PartialSequence): number[] =>
  Object.keys(s.parts)
    .map(Number)
    .sort((a, b) => a - b);

export const missing = (s: PartialSequence): number[] => {
  const have = new Set(received(s));
  return Array.from({ length: s.total }, (_, i) => i).filter((i) => !have.has(i));
};

function parity(bytes: Uint8Array): number {
  let x = 0;
  for (const b of bytes) x ^= b;
  return x;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export const sequenceKey = (s: Pick<ScannedSymbol, 'format' | 'sequenceId' | 'sequenceSize'>) =>
  `${s.format}/${s.sequenceId}/${s.sequenceSize}`;

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export interface AddResult {
  /** Finished payload (single symbol or complete sequence). */
  outcome: ScanOutcome | null;
  /** Sequence key for structured-append symbols. */
  key: string | null;
  /** False when the symbol was already stored with the same data (nothing to save). */
  changed: boolean;
  /**
   * Parts of a different message with the same id were found (e.g. an old saved read); the old
   * parts were dropped and only the fresh symbol kept.
   */
  conflict: boolean;
}

/** Collects structured-append symbols (possibly across frames and sessions) until a sequence is complete. */
export class SequenceCollector {
  private groups = new Map<string, PartialSequence>();

  add(s: ScannedSymbol): AddResult {
    if (s.sequenceSize < 2) {
      const inflated = decompressText(s.bytes);
      const outcome = { text: inflated ?? s.text, format: s.format, compressed: inflated !== null, parts: 1, bytes: s.bytes };
      return { outcome, key: null, changed: true, conflict: false };
    }
    const key = sequenceKey(s);
    const prev = this.groups.get(key);
    const existing = prev?.parts[s.sequenceIndex];
    if (existing && sameBytes(existing, s.bytes)) return { outcome: null, key, changed: false, conflict: false };
    // The same position with different data belongs to another message: start over from this one.
    let conflict = !!existing;
    let group = this.put(s, conflict ? undefined : prev);
    if (missing(group).length) return { outcome: null, key, changed: true, conflict };
    const merged = concat(Array.from({ length: group.total }, (_, i) => group.parts[i]));
    // QR structured append carries the XOR of all data bytes; a mismatch means mixed messages.
    if (/QR/i.test(group.format) && parity(merged) !== Number(group.sequenceId)) {
      conflict = true;
      group = this.put(s, undefined);
      return { outcome: null, key, changed: true, conflict };
    }
    this.groups.delete(key);
    const outcome = { ...decodeBytes(merged), format: group.format, parts: group.total, bytes: merged };
    return { outcome, key, changed: true, conflict };
  }

  /** Stores `s` on top of `base` as a new object, so UI state holding the old one sees the change. */
  private put(s: ScannedSymbol, base: PartialSequence | undefined): PartialSequence {
    const key = sequenceKey(s);
    const group: PartialSequence = {
      key,
      sequenceId: s.sequenceId,
      total: s.sequenceSize,
      format: s.format,
      parts: { ...base?.parts, [s.sequenceIndex]: s.bytes },
      last: s.sequenceIndex,
      updatedAt: Date.now(),
    };
    this.groups.set(key, group);
    for (const old of this.list().slice(PARTIAL_LIMIT)) this.groups.delete(old.key);
    return group;
  }

  /** Restores sequences saved earlier (e.g. after the camera or the page was closed), merging parts. */
  load(saved: readonly PartialSequence[]): void {
    for (const s of saved) {
      const mem = this.groups.get(s.key);
      this.groups.set(s.key, mem ? { ...mem, parts: { ...s.parts, ...mem.parts } } : s);
    }
  }

  get(key: string): PartialSequence | undefined {
    return this.groups.get(key);
  }

  /** Incomplete sequences, most recently updated first. */
  list(): PartialSequence[] {
    return [...this.groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  remove(key: string): void {
    this.groups.delete(key);
  }

  reset(): void {
    this.groups.clear();
  }
}

export type PartialSegment = { kind: 'text'; from: number; to: number; text: string } | { kind: 'missing'; from: number; to: number };

export interface PartialView {
  segments: PartialSegment[];
  compressed: boolean;
  /** Neither UTF-8 nor Shift_JIS: binary, or compressed data without symbol 1. */
  undecodable: boolean;
}

/** Consecutive runs of received / missing positions. */
function runs(s: PartialSequence): { have: boolean; from: number; to: number }[] {
  const out: { have: boolean; from: number; to: number }[] = [];
  for (let i = 0; i < s.total; i++) {
    const have = s.parts[i] !== undefined;
    const prev = out.at(-1);
    if (prev && prev.have === have) prev.to = i;
    else out.push({ have, from: i, to: i });
  }
  return out;
}

/** Decodes a run that may start or end inside a multi-byte character. */
function decodeRun(bytes: Uint8Array, sjis: boolean): string {
  if (sjis) return new TextDecoder('shift_jis').decode(bytes);
  let start = 0;
  // Skip UTF-8 continuation bytes left over from a missing previous part.
  while (start < 3 && start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  // stream: true drops an incomplete character at the end (its rest is in the next, missing part).
  return new TextDecoder('utf-8').decode(bytes.subarray(start), { stream: true });
}

// oxlint-disable-next-line no-control-regex -- control characters other than tab/newline mean binary data
const BINARY = /[\u0000-\u0008\u000e-\u001f]/;

function decodesAs(chunks: readonly Uint8Array[], encoding: 'utf-8' | 'shift_jis'): boolean {
  return chunks.every((c) => {
    let start = 0;
    if (encoding === 'utf-8') while (start < 3 && start < c.length && (c[start] & 0xc0) === 0x80) start++;
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(c.subarray(start), { stream: true });
      return !BINARY.test(text);
    } catch {
      return false;
    }
  });
}

/** Inflates as much of a deflate stream as the given prefix allows. */
function inflatePrefix(bytes: Uint8Array): string {
  const out: Uint8Array[] = [];
  const inflater = new Inflate((chunk) => out.push(chunk));
  try {
    inflater.push(bytes, false);
  } catch {
    // Corrupt or truncated data: keep whatever was produced.
  }
  const decoder = new TextDecoder('utf-8');
  return out.map((c) => decoder.decode(c, { stream: true })).join('');
}

/**
 * Text that can be recovered from an incomplete sequence. Plain text is shown run by run with
 * gaps for the missing symbols; compressed data can only be inflated from symbol 1 onwards.
 */
export function partialView(s: PartialSequence): PartialView {
  const first = s.parts[0];
  const compressed = !!first && first.length >= DEFLATE_MAGIC.length && DEFLATE_MAGIC.every((b, i) => first[i] === b);
  if (compressed) {
    const prefixRun = runs(s)[0];
    const bytes = concat(Array.from({ length: prefixRun.to + 1 }, (_, i) => s.parts[i]));
    const segments: PartialSegment[] = [{ kind: 'text', from: 0, to: prefixRun.to, text: inflatePrefix(bytes.subarray(DEFLATE_MAGIC.length)) }];
    if (prefixRun.to < s.total - 1) segments.push({ kind: 'missing', from: prefixRun.to + 1, to: s.total - 1 });
    return { segments, compressed: true, undecodable: false };
  }
  const all = runs(s);
  const runBytes = (r: { from: number; to: number }) => concat(Array.from({ length: r.to - r.from + 1 }, (_, k) => s.parts[r.from + k]));
  const chunks = all.filter((r) => r.have).map(runBytes);
  const utf8 = decodesAs(chunks, 'utf-8');
  const sjis = !utf8 && decodesAs(chunks, 'shift_jis');
  const undecodable = !utf8 && !sjis;
  const segments = all.map((r): PartialSegment => {
    if (!r.have) return { kind: 'missing', from: r.from, to: r.to };
    return { kind: 'text', from: r.from, to: r.to, text: undecodable ? '' : decodeRun(runBytes(r), sjis) };
  });
  return { segments, compressed: false, undecodable };
}

import { decompressText } from './optimize';

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

/** Collects structured-append symbols (possibly across frames) until a sequence is complete. */
export class SequenceCollector {
  private groups = new Map<string, Map<number, ScannedSymbol>>();

  /** Returns the finished outcome for `s`, or null while parts are still missing. */
  add(s: ScannedSymbol): ScanOutcome | null {
    if (s.sequenceSize < 2) {
      const inflated = decompressText(s.bytes);
      return { text: inflated ?? s.text, format: s.format, compressed: inflated !== null, parts: 1 };
    }
    const key = `${s.sequenceId}/${s.sequenceSize}`;
    const group = this.groups.get(key) ?? new Map<number, ScannedSymbol>();
    group.set(s.sequenceIndex, s);
    this.groups.set(key, group);
    if (group.size < s.sequenceSize) return null;
    const ordered = Array.from({ length: s.sequenceSize }, (_, i) => group.get(i)!);
    const total = ordered.reduce((n, p) => n + p.bytes.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const p of ordered) {
      merged.set(p.bytes, offset);
      offset += p.bytes.length;
    }
    this.groups.delete(key);
    return { ...decodeBytes(merged), format: s.format, parts: s.sequenceSize };
  }

  /** Progress of incomplete sequences: [found, total]. */
  pending(): [number, number][] {
    return [...this.groups.entries()].map(([key, g]) => [g.size, Number(key.split('/')[1])]);
  }

  reset(): void {
    this.groups.clear();
  }
}

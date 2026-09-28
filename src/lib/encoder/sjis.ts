// Shift_JIS encoding table built lazily from the platform's WHATWG `shift_jis` decoder,
// which avoids shipping large conversion tables.

let table: Map<string, Uint8Array> | null = null;

// Characters that CP932 and JIS X 0208 map differently; accept both spellings.
const ALIASES: readonly [string, string][] = [
  ['〜', '～'], // WAVE DASH / FULLWIDTH TILDE
  ['‖', '∥'], // DOUBLE VERTICAL LINE / PARALLEL TO
  ['−', '－'], // MINUS SIGN / FULLWIDTH HYPHEN-MINUS
  ['¢', '￠'], // CENT SIGN
  ['£', '￡'], // POUND SIGN
  ['¬', '￢'], // NOT SIGN
  ['—', '―'], // EM DASH / HORIZONTAL BAR
];

function build(): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  const decoder = new TextDecoder('shift_jis', { fatal: true });
  const add = (bytes: Uint8Array) => {
    let s: string;
    try {
      s = decoder.decode(bytes);
    } catch {
      return;
    }
    if (Array.from(s).length === 1 && !map.has(s)) map.set(s, bytes);
  };
  for (let b = 0xa1; b <= 0xdf; b++) add(Uint8Array.of(b)); // half-width katakana
  for (let lead = 0x81; lead <= 0xfc; lead++) {
    if (lead > 0x9f && lead < 0xe0) continue;
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (trail !== 0x7f) add(Uint8Array.of(lead, trail));
    }
  }
  for (const [a, b] of ALIASES) {
    const bytes = map.get(a) ?? map.get(b);
    if (!bytes) continue;
    if (!map.has(a)) map.set(a, bytes);
    if (!map.has(b)) map.set(b, bytes);
  }
  return map;
}

/** Shift_JIS bytes for one non-ASCII character, or null when it has no mapping. */
export function sjisBytes(ch: string): Uint8Array | null {
  table ??= build();
  return table.get(ch) ?? null;
}

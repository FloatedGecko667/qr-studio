import type { Mode } from './chars';
import { headerBits, checkFeatures, type EncodeOptions } from './index';
import { ecLevelsFor, symbolSpec, versionsFor, type SymbolSpec, type SymbolType } from './symbols';

function payloadBits(mode: Mode, n: number): number {
  switch (mode) {
    case 'numeric':
      return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
    case 'alnum':
      return Math.floor(n / 2) * 11 + (n % 2) * 6;
    case 'byte':
      return n * 8;
    case 'kanji':
      return n * 13;
  }
}

/** Largest n with payloadBits(mode, n) <= bits. */
function fitChars(mode: Mode, bits: number): number {
  if (bits <= 0) return 0;
  switch (mode) {
    case 'numeric': {
      const n = Math.floor(bits / 10) * 3;
      const rest = bits % 10;
      return n + (rest >= 7 ? 2 : rest >= 4 ? 1 : 0);
    }
    case 'alnum':
      return Math.floor(bits / 11) * 2 + (bits % 11 >= 6 ? 1 : 0);
    case 'byte':
      return Math.floor(bits / 8);
    case 'kanji':
      return Math.floor(bits / 13);
  }
}

/**
 * Maximum characters of a single mode that fit into `availableBits`, splitting into
 * several segments when the character count indicator is too narrow.
 */
export function maxChars(spec: SymbolSpec, mode: Mode, availableBits = spec.dataBits): number | null {
  const cci = spec.layout.countBits[mode];
  if (cci === undefined) return null;
  const segHeader = spec.layout.modeBits + cci;
  const maxCount = (1 << cci) - 1;
  let bits = availableBits;
  let total = 0;
  while (bits > segHeader) {
    const n = Math.min(maxCount, fitChars(mode, bits - segHeader));
    if (n === 0) break;
    total += n;
    bits -= segHeader + payloadBits(mode, n);
    if (n < maxCount) break;
  }
  return total;
}

export interface CapacityRow {
  spec: SymbolSpec;
  /** Data bits available for segments in one symbol after ECI/FNC1/structured-append headers. */
  availableBits: number;
  numeric: number | null;
  alnum: number | null;
  byte: number | null;
  kanji: number | null;
  /** Feature (e.g. 'eci') the symbol cannot provide for the chosen options. */
  unsupported: string | null;
}

export type CapacityOptions = Pick<EncodeOptions, 'eci' | 'fnc1' | 'structuredAppend'>;

export function capacityRow(spec: SymbolSpec, opts: CapacityOptions): CapacityRow {
  const count = opts.structuredAppend ?? 1;
  const availableBits = spec.dataBits - headerBits(spec, opts);
  const per = (mode: Mode) => {
    const n = maxChars(spec, mode, availableBits);
    return n === null ? null : n * count;
  };
  return {
    spec,
    availableBits,
    numeric: per('numeric'),
    alnum: per('alnum'),
    byte: per('byte'),
    kanji: per('kanji'),
    unsupported: checkFeatures(spec, opts),
  };
}

/** Every (version, EC level) row for a symbol type in version order. */
export function capacityRows(type: SymbolType, opts: CapacityOptions): CapacityRow[] {
  const rows: CapacityRow[] = [];
  for (const v of versionsFor(type)) {
    for (const l of ecLevelsFor(type, v)) rows.push(capacityRow(symbolSpec(type, v, l), opts));
  }
  return rows;
}

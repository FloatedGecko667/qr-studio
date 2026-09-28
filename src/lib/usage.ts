import { requiredBits, specsBySize, STRUCTURED_APPEND_HEADER_BITS, symbolSpec, type EncodeOptions, type SymbolSpec, type Unit } from './encoder';
import { encodeOptions, MAX_APPEND, type Prepared, type PipelineResult } from './pipeline';
import type { SymbolSettings } from './settings';

export interface Meter {
  /** Symbol the data is compared against, e.g. "2-M" or "40-M". */
  label: string;
  count: number;
  usedBits: number;
  limitBits: number;
}

export interface Usage {
  chars: number;
  bytes: number;
  /** Symbol(s) actually generated right now (absent when encoding failed). */
  current: Meter | null;
  /** Largest capacity the current settings allow (auto version → largest version, auto append → 16). */
  limit: Meter;
}

/**
 * Data bits for the whole input against the net capacity of `count` symbols. Each
 * structured-append symbol spends 20 header bits, which are taken off the capacity rather
 * than added to the usage, so small inputs do not look inflated by unused symbols.
 */
function meter(units: readonly Unit[], spec: SymbolSpec, opts: EncodeOptions, count: number): Meter {
  const header = count > 1 ? STRUCTURED_APPEND_HEADER_BITS : 0;
  return {
    label: spec.label,
    count,
    usedBits: requiredBits(units, spec, { ...opts, structuredAppend: 1 }),
    limitBits: (spec.dataBits - header) * count,
  };
}

/** Compares the input size with the current symbol and with the maximum the settings permit. */
export function computeUsage(prepared: Prepared, symbol: SymbolSettings, pipeline: PipelineResult, textChars: number | null): Usage {
  const bytes = prepared.units.reduce((n, u) => n + u.bytes.length, 0);
  const opts = encodeOptions(symbol, prepared);
  const limitSpec =
    symbol.version === 'auto' ? specsBySize(symbol.type, symbol.ecLevel).at(-1)! : symbolSpec(symbol.type, symbol.version, symbol.ecLevel);
  const limitCount = symbol.structuredAppend === 'auto' ? (symbol.type === 'model2' ? MAX_APPEND : 1) : symbol.structuredAppend;

  let current: Meter | null = null;
  if (pipeline.status === 'ok') {
    const syms = pipeline.result.symbols;
    current = {
      label: syms[0].spec.label,
      count: syms.length,
      usedBits: syms.reduce((n, s) => n + s.usedBits, 0),
      limitBits: syms[0].spec.dataBits * syms.length,
    };
  }
  return {
    chars: textChars ?? bytes,
    bytes,
    current,
    limit: meter(prepared.units, limitSpec, opts, limitCount),
  };
}

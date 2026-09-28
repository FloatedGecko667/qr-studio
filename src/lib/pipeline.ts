import {
  ECI_FOR_CHARSET,
  EncodeError,
  encode,
  prepareBytes,
  prepareText,
  requiredBits,
  specsBySize,
  splitUnits,
  type Charset,
  type EcLevel,
  type EncodeOptions,
  type EncodeResult,
  type Unit,
} from './encoder';
import { ecLevelsFor } from './encoder/symbols';
import type { Payload } from './payload';
import type { SymbolSettings } from './settings';

export type Suggestion =
  | { type: 'version'; version: number }
  | { type: 'ecLevel'; ecLevel: EcLevel }
  | { type: 'structuredAppend'; count: number }
  | { type: 'model2' };

export type PipelineResult =
  | { status: 'invalid'; errors: string[] }
  | { status: 'charset' }
  | { status: 'unsupported'; feature: string }
  | { status: 'too-long'; requiredBits: number; availableBits: number; suggestions: Suggestion[] }
  | { status: 'ok'; result: EncodeResult; units: Unit[]; charset: Charset; opts: EncodeOptions; compression?: Prepared['compression'] };

export interface Prepared {
  units: Unit[];
  charset: Charset;
  fnc1: boolean;
  /** Raw bytes (binary input or compressed data): no text charset, so no ECI. */
  binary?: boolean;
  /** Set when the deflated form was chosen: original / compressed byte counts. */
  compression?: { originalBytes: number; compressedBytes: number };
}

/** Spec used to compare alternatives: the fixed version, or the largest one for 'auto'. */
function referenceSpec(symbol: SymbolSettings) {
  return symbol.version === 'auto'
    ? specsBySize(symbol.type, symbol.ecLevel).at(-1)!
    : specsBySize(symbol.type, symbol.ecLevel).find((s) => s.version === symbol.version)!;
}

export function preparePayload(payload: Payload, symbol: SymbolSettings): Prepared | 'charset' | null {
  if (payload.errors.length) return null;
  if (payload.bytes) return { ...prepareBytes(payload.bytes), fnc1: false, binary: true };
  let text: Prepared | 'charset';
  try {
    text = { ...prepareText(payload.text ?? '', symbol.charset, payload.fnc1), fnc1: payload.fnc1 === true };
  } catch {
    text = 'charset';
  }
  if (!payload.compressed) return text;
  const zipped: Prepared = { ...prepareBytes(payload.compressed), fnc1: false, binary: true };
  if (text !== 'charset') {
    const spec = referenceSpec(symbol);
    if (requiredBits(zipped.units, spec, {}) >= requiredBits(text.units, spec, {})) return text;
  }
  const originalBytes = new TextEncoder().encode(payload.text ?? '').length;
  return { ...zipped, compression: { originalBytes, compressedBytes: payload.compressed.length } };
}

export const MAX_APPEND = 16;

/** Encode options for fixed settings; `appendCount` resolves an 'auto' structured-append setting. */
export function encodeOptions(symbol: SymbolSettings, prepared: Prepared, appendCount = 1): EncodeOptions {
  return {
    type: symbol.type,
    ecLevel: symbol.ecLevel,
    version: symbol.version,
    mask: symbol.mask,
    // Binary payloads carry no text encoding, so an ECI would be misleading.
    eci: symbol.eci && prepared.units.length > 0 && !prepared.fnc1 && !prepared.binary ? ECI_FOR_CHARSET[prepared.charset] : undefined,
    fnc1: prepared.fnc1,
    structuredAppend: symbol.structuredAppend === 'auto' ? appendCount : symbol.structuredAppend,
  };
}

export function fitsWith(units: readonly Unit[], opts: EncodeOptions): boolean {
  const count = opts.structuredAppend ?? 1;
  const parts = count > 1 ? splitUnits(units, count) : [units];
  const candidates =
    opts.version === 'auto'
      ? specsBySize(opts.type, opts.ecLevel)
      : specsBySize(opts.type, opts.ecLevel).filter((s) => s.version === opts.version);
  return candidates.some((spec) => parts.every((p) => requiredBits(p, spec, opts) <= spec.dataBits));
}

/** Smallest version that fits with the chosen EC level (used when the version is fixed). */
function smallestVersion(units: readonly Unit[], opts: EncodeOptions): number | null {
  for (const spec of specsBySize(opts.type, opts.ecLevel)) {
    if (fitsWith(units, { ...opts, version: spec.version })) return spec.version;
  }
  return null;
}

export function suggestFixes(units: readonly Unit[], opts: EncodeOptions): Suggestion[] {
  const out: Suggestion[] = [];
  if (opts.version !== 'auto') {
    const v = smallestVersion(units, opts);
    if (v !== null) out.push({ type: 'version', version: v });
  }
  for (const l of ecLevelsFor(opts.type).filter((l) => l !== opts.ecLevel)) {
    if (['L', 'M', 'Q', 'H'].indexOf(l) >= ['L', 'M', 'Q', 'H'].indexOf(opts.ecLevel)) continue;
    if (fitsWith(units, { ...opts, ecLevel: l, version: 'auto' })) {
      out.push({ type: 'ecLevel', ecLevel: l });
      break;
    }
  }
  if (opts.type === 'model2') {
    for (let n = Math.max(2, (opts.structuredAppend ?? 1) + 1); n <= 16; n++) {
      if (fitsWith(units, { ...opts, structuredAppend: n, version: 'auto' })) {
        out.push({ type: 'structuredAppend', count: n });
        break;
      }
    }
  } else if (fitsWith(units, { ...opts, type: 'model2', version: 'auto', ecLevel: opts.ecLevel === 'L' ? 'L' : 'M', mask: 'auto' })) {
    out.push({ type: 'model2' });
  }
  return out;
}

/**
 * Resolves 'auto' structured append to the fewest symbols (1 = single symbol) that hold the
 * data with the chosen version / EC level; falls back to the maximum so errors report it.
 */
export function resolveOptions(symbol: SymbolSettings, prepared: Prepared): EncodeOptions {
  if (symbol.structuredAppend !== 'auto' || symbol.type !== 'model2') return encodeOptions(symbol, prepared);
  for (let n = 1; n <= MAX_APPEND; n++) {
    const opts = encodeOptions(symbol, prepared, n);
    if (fitsWith(prepared.units, opts)) return opts;
  }
  return encodeOptions(symbol, prepared, MAX_APPEND);
}

export function runPipeline(payload: Payload, symbol: SymbolSettings): PipelineResult {
  const prepared = preparePayload(payload, symbol);
  if (prepared === null) return { status: 'invalid', errors: payload.errors };
  if (prepared === 'charset') return { status: 'charset' };
  const opts = resolveOptions(symbol, prepared);
  try {
    const result = encode(prepared.units, opts);
    return { status: 'ok', result, units: prepared.units, charset: prepared.charset, opts, compression: prepared.compression };
  } catch (e) {
    if (!(e instanceof EncodeError)) throw e;
    if (e.code === 'unsupported') return { status: 'unsupported', feature: e.message };
    return {
      status: 'too-long',
      requiredBits: e.requiredBits ?? 0,
      availableBits: e.availableBits ?? 0,
      suggestions: suggestFixes(prepared.units, opts),
    };
  }
}

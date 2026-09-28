import { BitBuffer } from './bits';
import { bytesToUnits, isSjisEncodable, textToUnits, unitsToBytes, type Charset, type Unit } from './chars';
import { buildMicro } from './micro';
import { buildModel2 } from './model2';
import { buildRmqr } from './rmqr';
import { rsEncode } from './rs';
import {
  eciDesignatorBits,
  optimalSegments,
  segmentsBitLength,
  writeEciDesignator,
  writeSegments,
  type Segment,
} from './segments';
import { specsBySize, symbolSpec, type EcLevel, type SymbolSpec, type SymbolType } from './symbols';

export type { Charset, Unit } from './chars';
export type { EcLevel, SymbolSpec, SymbolType } from './symbols';
export { ecLevelsFor, specsBySize, symbolSpec, versionLabel, versionsFor } from './symbols';

/** ECI assignment numbers for the charsets the encoder produces. */
export const ECI_FOR_CHARSET: Record<Charset, number> = { sjis: 20, utf8: 26 };

export const STRUCTURED_APPEND_HEADER_BITS = 20;

export interface EncodeOptions {
  type: SymbolType;
  ecLevel: EcLevel;
  version: number | 'auto';
  mask: number | 'auto';
  /** ECI assignment number to emit before the data, if any. */
  eci?: number;
  /** GS1: emit FNC1 in first position. */
  fnc1?: boolean;
  /** Number of structured-append symbols (1 = off, 2-16). */
  structuredAppend?: number;
}

export interface EncodedSymbol {
  spec: SymbolSpec;
  width: number;
  height: number;
  /** Row-major, 1 = dark. Quiet zone not included. */
  modules: Uint8Array;
  mask: number;
  usedBits: number;
}

export interface EncodeResult {
  symbols: EncodedSymbol[];
  /** Structured append parity byte, when used. */
  parity?: number;
}

export type EncodeErrorCode = 'too-long' | 'unsupported';

export class EncodeError extends Error {
  constructor(
    readonly code: EncodeErrorCode,
    message: string,
    /** Bits required for the largest symbol vs. what the chosen symbol offers. */
    readonly requiredBits?: number,
    readonly availableBits?: number,
  ) {
    super(message);
    this.name = 'EncodeError';
  }
}

export interface PreparedText {
  units: Unit[];
  charset: Charset;
}

/** Converts text to encoder units, picking Shift_JIS when every character supports it. */
export function prepareText(text: string, charset: Charset | 'auto' = 'auto', fnc1 = false): PreparedText {
  const cs: Charset = charset === 'auto' ? (isSjisEncodable(text) ? 'sjis' : 'utf8') : charset;
  return { units: textToUnits(text, cs, fnc1), charset: cs };
}

export function prepareBytes(bytes: Uint8Array): PreparedText {
  return { units: bytesToUnits(bytes), charset: 'utf8' };
}

/** Header bits (ECI, FNC1, structured append) that precede the data segments. */
export function headerBits(spec: SymbolSpec, opts: Pick<EncodeOptions, 'eci' | 'fnc1' | 'structuredAppend'>): number {
  let bits = 0;
  if ((opts.structuredAppend ?? 1) > 1) bits += STRUCTURED_APPEND_HEADER_BITS;
  if (opts.eci !== undefined) bits += spec.layout.modeBits + eciDesignatorBits(opts.eci);
  if (opts.fnc1) bits += spec.layout.modeBits;
  return bits;
}

export function checkFeatures(spec: SymbolSpec, opts: Pick<EncodeOptions, 'eci' | 'fnc1' | 'structuredAppend'>): string | null {
  if ((opts.structuredAppend ?? 1) > 1 && spec.structuredAppendCode === undefined) return 'structured-append';
  if (opts.eci !== undefined && spec.eciCode === undefined) return 'eci';
  if (opts.fnc1 && spec.fnc1Code === undefined) return 'fnc1';
  return null;
}

const segmentCache = new WeakMap<readonly Unit[], Map<string, { segments: Segment[]; bits: number }>>();

/** Optimal segmentation for `spec`, memoized per unit array and count-indicator widths. */
export function segmentsFor(units: readonly Unit[], spec: SymbolSpec): { segments: Segment[]; bits: number } {
  let cache = segmentCache.get(units);
  if (!cache) {
    cache = new Map();
    segmentCache.set(units, cache);
  }
  const key = `${spec.layout.modeBits}:${JSON.stringify(spec.layout.countBits)}`;
  let hit = cache.get(key);
  if (!hit) {
    try {
      const segments = optimalSegments(units, spec.layout);
      hit = { segments, bits: segmentsBitLength(segments, spec.layout) };
    } catch {
      hit = { segments: [], bits: Number.POSITIVE_INFINITY };
    }
    cache.set(key, hit);
  }
  return hit;
}

/** Splits units into `n` parts with roughly equal byte length. */
export function splitUnits(units: readonly Unit[], n: number): Unit[][] {
  const total = units.reduce((s, u) => s + u.bytes.length, 0);
  const parts: Unit[][] = [];
  let current: Unit[] = [];
  let acc = 0;
  for (const u of units) {
    const target = (total * (parts.length + 1)) / n;
    if (acc >= target && parts.length < n - 1 && current.length > 0) {
      parts.push(current);
      current = [];
    }
    current.push(u);
    acc += u.bytes.length;
  }
  parts.push(current);
  while (parts.length < n) parts.push([]);
  return parts;
}

function toDataCodewords(buf: BitBuffer, spec: SymbolSpec): Uint8Array {
  const cap = spec.dataBits;
  const bits = buf.bits.slice();
  for (let i = Math.min(spec.terminatorBits, cap - bits.length); i > 0; i--) bits.push(0);
  const fullBits = Math.floor(cap / 8) * 8;
  if (bits.length < fullBits) {
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xec; bits.length < fullBits; pad ^= 0xec ^ 0x11) {
      for (let i = 7; i >= 0; i--) bits.push((pad >>> i) & 1);
    }
  }
  while (bits.length < cap) bits.push(0);
  const out = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < cap; i++) out[i >>> 3] |= bits[i] << (7 - (i & 7));
  return out;
}

/** Adds error correction, interleaves blocks and returns the final bit sequence. */
function finalBits(data: Uint8Array, spec: SymbolSpec): number[] {
  const [ecPer, c1, k1, c2, k2] = spec.ecBlocks;
  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < c1 + c2; i++) {
    const k = i < c1 ? k1 : k2;
    blocks.push(data.subarray(offset, offset + k));
    offset += k;
  }
  const ecc = blocks.map((b) => rsEncode(b, ecPer));
  const bits: number[] = [];
  const push = (v: number, n: number) => {
    for (let i = 7; i >= 8 - n; i--) bits.push((v >>> i) & 1);
  };
  const maxK = Math.max(k1, k2);
  const halfLast = spec.dataBits % 8 === 4; // Micro QR M1 / M3
  for (let i = 0; i < maxK; i++) {
    for (const b of blocks) {
      if (i >= b.length) continue;
      push(b[i], halfLast && i === b.length - 1 ? 4 : 8);
    }
  }
  for (let i = 0; i < ecPer; i++) for (const e of ecc) push(e[i], 8);
  return bits;
}

function buildSymbol(
  spec: SymbolSpec,
  units: readonly Unit[],
  opts: EncodeOptions,
  sa?: { index: number; total: number; parity: number },
): EncodedSymbol {
  const buf = new BitBuffer();
  const mb = spec.layout.modeBits;
  if (sa) {
    buf.push(spec.structuredAppendCode!, 4);
    buf.push(sa.index, 4);
    buf.push(sa.total - 1, 4);
    buf.push(sa.parity, 8);
  }
  if (opts.eci !== undefined) {
    buf.push(spec.eciCode!, mb);
    writeEciDesignator(buf, opts.eci);
  }
  if (opts.fnc1) buf.push(spec.fnc1Code!, mb);
  const { segments } = segmentsFor(units, spec);
  writeSegments(buf, segments, spec.layout);
  const usedBits = buf.length;
  if (usedBits > spec.dataBits) {
    throw new EncodeError('too-long', 'Data does not fit', usedBits, spec.dataBits);
  }
  const bits = finalBits(toDataCodewords(buf, spec), spec);
  const mask = opts.mask === 'auto' ? 'auto' : opts.mask;
  const built =
    spec.type === 'model2'
      ? buildModel2(spec, bits, mask)
      : spec.type === 'micro'
        ? buildMicro(spec, bits, mask)
        : buildRmqr(spec, bits);
  return {
    spec,
    width: spec.width,
    height: spec.height,
    modules: built.matrix.modules,
    mask: built.mask,
    usedBits,
  };
}

/** Bits required to encode `units` in `spec` (header included). */
export function requiredBits(units: readonly Unit[], spec: SymbolSpec, opts: Pick<EncodeOptions, 'eci' | 'fnc1' | 'structuredAppend'>): number {
  return headerBits(spec, opts) + segmentsFor(units, spec).bits;
}

/** Picks the spec for the options, or the smallest fitting one when version is 'auto'. */
export function resolveSpec(parts: readonly (readonly Unit[])[], opts: EncodeOptions): SymbolSpec {
  const fits = (spec: SymbolSpec) => parts.every((p) => requiredBits(p, spec, opts) <= spec.dataBits);
  if (opts.version !== 'auto') {
    const spec = symbolSpec(opts.type, opts.version, opts.ecLevel);
    const feature = checkFeatures(spec, opts);
    if (feature) throw new EncodeError('unsupported', feature);
    if (!fits(spec)) {
      const need = Math.max(...parts.map((p) => requiredBits(p, spec, opts)));
      throw new EncodeError('too-long', 'Data does not fit', need, spec.dataBits);
    }
    return spec;
  }
  const candidates = specsBySize(opts.type, opts.ecLevel);
  let unsupported: string | null = null;
  for (const spec of candidates) {
    const feature = checkFeatures(spec, opts);
    if (feature) {
      unsupported = feature;
      continue;
    }
    if (fits(spec)) return spec;
  }
  if (unsupported && candidates.every((s) => checkFeatures(s, opts))) throw new EncodeError('unsupported', unsupported);
  const largest = candidates[candidates.length - 1];
  const need = Math.max(...parts.map((p) => requiredBits(p, largest, opts)));
  throw new EncodeError('too-long', 'Data does not fit', need, largest.dataBits);
}

export function encode(units: readonly Unit[], opts: EncodeOptions): EncodeResult {
  const count = opts.structuredAppend ?? 1;
  if (count < 1 || count > 16 || !Number.isInteger(count)) throw new RangeError('structuredAppend must be 1-16');
  if (count === 1) {
    const spec = resolveSpec([units], opts);
    return { symbols: [buildSymbol(spec, units, opts)] };
  }
  const parts = splitUnits(units, count);
  const spec = resolveSpec(parts, opts);
  const parity = unitsToBytes(units).reduce((p, b) => p ^ b, 0);
  const symbols = parts.map((p, index) => buildSymbol(spec, p, opts, { index, total: count, parity }));
  return { symbols, parity };
}

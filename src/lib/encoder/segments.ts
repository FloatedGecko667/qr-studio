import { BitBuffer } from './bits';
import type { Mode, Unit } from './chars';

export const MODES: readonly Mode[] = ['numeric', 'alnum', 'byte', 'kanji'];

/** Bit-level layout rules that differ between Model 2, Micro QR and rMQR. */
export interface ModeLayout {
  /** Width of the mode indicator (0 for M1). */
  readonly modeBits: number;
  /** Mode indicator value, or undefined if the symbol does not support the mode. */
  readonly modeCode: Readonly<Partial<Record<Mode, number>>>;
  /** Width of the character count indicator per mode. */
  readonly countBits: Readonly<Partial<Record<Mode, number>>>;
}

export interface Segment {
  readonly mode: Mode;
  readonly units: readonly Unit[];
}

export function supports(layout: ModeLayout, mode: Mode): boolean {
  return layout.modeCode[mode] !== undefined;
}

function unitSupports(u: Unit, mode: Mode): boolean {
  switch (mode) {
    case 'numeric':
      return u.numeric >= 0;
    case 'alnum':
      return u.alnum >= 0;
    case 'kanji':
      return u.kanji >= 0;
    case 'byte':
      return true;
  }
}

/** Count value stored in the character count indicator. */
function segmentCount(mode: Mode, units: readonly Unit[]): number {
  if (mode !== 'byte') return units.length;
  return units.reduce((n, u) => n + u.bytes.length, 0);
}

function payloadBits(mode: Mode, units: readonly Unit[]): number {
  const n = units.length;
  switch (mode) {
    case 'numeric':
      return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3];
    case 'alnum':
      return Math.floor(n / 2) * 11 + (n % 2) * 6;
    case 'kanji':
      return n * 13;
    case 'byte':
      return segmentCount('byte', units) * 8;
  }
}

/** Splits segments whose count would overflow the character count indicator. */
function splitOversized(segments: Segment[], layout: ModeLayout): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const max = (1 << layout.countBits[seg.mode]!) - 1;
    let chunk: Unit[] = [];
    let count = 0;
    for (const u of seg.units) {
      const c = seg.mode === 'byte' ? u.bytes.length : 1;
      if (count + c > max && chunk.length > 0) {
        out.push({ mode: seg.mode, units: chunk });
        chunk = [];
        count = 0;
      }
      chunk.push(u);
      count += c;
    }
    if (chunk.length > 0) out.push({ mode: seg.mode, units: chunk });
  }
  return out;
}

/**
 * Chooses the mode sequence with the fewest bits using dynamic programming.
 * Costs are tracked in 1/6 bit units so numeric (10/3) and alphanumeric (11/2) are exact.
 */
export function optimalSegments(units: readonly Unit[], layout: ModeLayout): Segment[] {
  if (units.length === 0) return [];
  const modes = MODES.filter((m) => supports(layout, m));
  if (units.some((u) => !modes.some((m) => unitSupports(u, m)))) {
    throw new RangeError('Input contains characters this symbol cannot encode');
  }
  const head = modes.map((m) => (layout.modeBits + layout.countBits[m]!) * 6);
  const perChar = (m: Mode, u: Unit): number => {
    switch (m) {
      case 'numeric':
        return 20;
      case 'alnum':
        return 33;
      case 'kanji':
        return 78;
      case 'byte':
        return u.bytes.length * 48;
    }
  };

  const INF = Number.POSITIVE_INFINITY;
  let prev = head.slice();
  // charMode[i][j]: mode index in which char i is encoded, given that after char i the
  // encoder is in state j (continuing mode j, or having just opened a new segment of mode j).
  const charMode: Int8Array[] = [];
  for (const u of units) {
    const cur = modes.map(() => INF);
    const at = new Int8Array(modes.length).fill(-1);
    modes.forEach((m, j) => {
      if (unitSupports(u, m)) {
        cur[j] = prev[j] + perChar(m, u);
        at[j] = j;
      }
    });
    const settled = cur.slice();
    const settledAt = at.slice();
    modes.forEach((_, j) => {
      modes.forEach((_, k) => {
        if (k === j || settledAt[k] < 0) return;
        const cost = Math.ceil(settled[k] / 6) * 6 + head[j];
        if (cost < cur[j]) {
          cur[j] = cost;
          at[j] = k;
        }
      });
    });
    charMode.push(at);
    prev = cur;
  }

  let state = 0;
  for (let j = 1; j < modes.length; j++) if (prev[j] < prev[state]) state = j;
  const charModes: Mode[] = Array.from({ length: units.length });
  for (let i = units.length - 1; i >= 0; i--) {
    state = charMode[i][state];
    charModes[i] = modes[state];
  }

  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= units.length; i++) {
    if (i === units.length || charModes[i] !== charModes[start]) {
      segments.push({ mode: charModes[start], units: units.slice(start, i) });
      start = i;
    }
  }
  return splitOversized(segments, layout);
}

export function segmentsBitLength(segments: readonly Segment[], layout: ModeLayout): number {
  let bits = 0;
  for (const s of segments) bits += layout.modeBits + layout.countBits[s.mode]! + payloadBits(s.mode, s.units);
  return bits;
}

export function writeSegments(buf: BitBuffer, segments: readonly Segment[], layout: ModeLayout): void {
  for (const s of segments) {
    buf.push(layout.modeCode[s.mode]!, layout.modeBits);
    buf.push(segmentCount(s.mode, s.units), layout.countBits[s.mode]!);
    writePayload(buf, s);
  }
}

function writePayload(buf: BitBuffer, s: Segment): void {
  const u = s.units;
  switch (s.mode) {
    case 'numeric':
      for (let i = 0; i < u.length; i += 3) {
        const n = Math.min(3, u.length - i);
        let v = 0;
        for (let j = 0; j < n; j++) v = v * 10 + u[i + j].numeric;
        buf.push(v, [0, 4, 7, 10][n]);
      }
      return;
    case 'alnum':
      for (let i = 0; i + 1 < u.length; i += 2) buf.push(u[i].alnum * 45 + u[i + 1].alnum, 11);
      if (u.length % 2) buf.push(u[u.length - 1].alnum, 6);
      return;
    case 'kanji':
      for (const x of u) buf.push(x.kanji, 13);
      return;
    case 'byte':
      for (const x of u) for (const b of x.bytes) buf.push(b, 8);
      return;
  }
}

/** Bits needed for an ECI designator (excluding the mode indicator). */
export function eciDesignatorBits(value: number): number {
  return value < 128 ? 8 : value < 16384 ? 16 : 24;
}

export function writeEciDesignator(buf: BitBuffer, value: number): void {
  if (value < 128) buf.push(value, 8);
  else if (value < 16384) buf.push(0b10 << 14 | value, 16);
  else buf.push(0b110 << 21 | value, 24);
}

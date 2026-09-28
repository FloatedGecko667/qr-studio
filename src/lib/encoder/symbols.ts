import type { Mode } from './chars';
import type { ModeLayout } from './segments';
import { MODEL2_EC, RMQR_SPECS, type EcBlocks } from './specTables';

export type SymbolType = 'model2' | 'micro' | 'rmqr';
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export const EC_LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

/** Everything the encoder needs to know about one (version, EC level) combination. */
export interface SymbolSpec {
  readonly type: SymbolType;
  /** Model 2: 1-40, Micro: 1-4 (M1-M4), rMQR: 0-31 (version indicator). */
  readonly version: number;
  readonly ecLevel: EcLevel;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Usable data bits (M1/M3 end with a 4-bit codeword). */
  readonly dataBits: number;
  readonly dataCodewords: number;
  readonly ecBlocks: EcBlocks;
  readonly layout: ModeLayout;
  readonly terminatorBits: number;
  /** Mode indicator values for ECI / FNC1 (first position) / structured append, if supported. */
  readonly eciCode?: number;
  readonly fnc1Code?: number;
  readonly structuredAppendCode?: number;
}

const MODEL2_CODES: Record<Mode, number> = { numeric: 1, alnum: 2, byte: 4, kanji: 8 };

function model2CountBits(version: number): Record<Mode, number> {
  const g = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return {
    numeric: [10, 12, 14][g],
    alnum: [9, 11, 13][g],
    byte: [8, 16, 16][g],
    kanji: [8, 10, 12][g],
  };
}

function totalData(b: EcBlocks): number {
  return b[1] * b[2] + b[3] * b[4];
}

export function model2Spec(version: number, ecLevel: EcLevel): SymbolSpec {
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new RangeError('version');
  const ecBlocks = MODEL2_EC[version - 1][EC_LEVELS.indexOf(ecLevel)];
  const dataCodewords = totalData(ecBlocks);
  const size = version * 4 + 17;
  return {
    type: 'model2',
    version,
    ecLevel,
    label: `${version}-${ecLevel}`,
    width: size,
    height: size,
    dataBits: dataCodewords * 8,
    dataCodewords,
    ecBlocks,
    layout: { modeBits: 4, modeCode: MODEL2_CODES, countBits: model2CountBits(version) },
    terminatorBits: 4,
    eciCode: 7,
    fnc1Code: 5,
    structuredAppendCode: 3,
  };
}

/** [version, ecLevel, dataBits, ecCodewords] per ISO/IEC 18004 Table 9 (Micro QR rows). */
const MICRO_TABLE: readonly (readonly [number, EcLevel, number, number])[] = [
  [1, 'L', 20, 2],
  [2, 'L', 40, 5],
  [2, 'M', 32, 6],
  [3, 'L', 84, 6],
  [3, 'M', 68, 8],
  [4, 'L', 128, 8],
  [4, 'M', 112, 10],
  [4, 'Q', 80, 14],
];

const MICRO_LAYOUTS: readonly ModeLayout[] = [
  { modeBits: 0, modeCode: { numeric: 0 }, countBits: { numeric: 3 } },
  { modeBits: 1, modeCode: { numeric: 0, alnum: 1 }, countBits: { numeric: 4, alnum: 3 } },
  {
    modeBits: 2,
    modeCode: { numeric: 0, alnum: 1, byte: 2, kanji: 3 },
    countBits: { numeric: 5, alnum: 4, byte: 4, kanji: 3 },
  },
  {
    modeBits: 3,
    modeCode: { numeric: 0, alnum: 1, byte: 2, kanji: 3 },
    countBits: { numeric: 6, alnum: 5, byte: 5, kanji: 4 },
  },
];

/** Symbol number stored in Micro QR format information (0-7). */
export function microSymbolNumber(spec: SymbolSpec): number {
  return MICRO_TABLE.findIndex(([v, l]) => v === spec.version && l === spec.ecLevel);
}

export function microSpec(version: number, ecLevel: EcLevel): SymbolSpec {
  const row = MICRO_TABLE.find(([v, l]) => v === version && l === ecLevel);
  if (!row) throw new RangeError(`M${version}-${ecLevel} does not exist`);
  const [, , dataBits, ec] = row;
  const dataCodewords = Math.ceil(dataBits / 8);
  const size = version * 2 + 9;
  return {
    type: 'micro',
    version,
    ecLevel,
    label: version === 1 ? 'M1' : `M${version}-${ecLevel}`,
    width: size,
    height: size,
    dataBits,
    dataCodewords,
    ecBlocks: [ec, 1, dataCodewords, 0, 0],
    layout: MICRO_LAYOUTS[version - 1],
    terminatorBits: version * 2 + 1,
  };
}

/** ISO/IEC 23941:2022 Table 3, indexed by version indicator. */
const RMQR_COUNT_BITS: Record<Mode, readonly number[]> = {
  numeric: [4, 5, 6, 7, 7, 5, 6, 7, 7, 8, 4, 6, 7, 7, 8, 8, 5, 6, 7, 7, 8, 8, 7, 7, 8, 8, 9, 7, 8, 8, 8, 9],
  alnum: [3, 5, 5, 6, 6, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 5, 6, 6, 7, 7, 8, 6, 7, 7, 7, 8, 6, 7, 7, 8, 8],
  byte: [3, 4, 5, 5, 6, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 6, 6, 7, 7, 7, 6, 6, 7, 7, 8],
  kanji: [2, 3, 4, 5, 5, 3, 4, 5, 5, 6, 2, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 5, 5, 6, 6, 7, 5, 6, 6, 6, 7],
};

export function rmqrSpec(version: number, ecLevel: EcLevel): SymbolSpec {
  const s = RMQR_SPECS[version];
  if (!s || (ecLevel !== 'M' && ecLevel !== 'H')) throw new RangeError('rMQR supports M/H, versions 0-31');
  const ecBlocks = ecLevel === 'M' ? s.M : s.H;
  const dataCodewords = totalData(ecBlocks);
  return {
    type: 'rmqr',
    version,
    ecLevel,
    label: `${s.name}-${ecLevel}`,
    width: s.width,
    height: s.height,
    dataBits: dataCodewords * 8,
    dataCodewords,
    ecBlocks,
    layout: {
      modeBits: 3,
      modeCode: { numeric: 1, alnum: 2, byte: 3, kanji: 4 },
      countBits: {
        numeric: RMQR_COUNT_BITS.numeric[version],
        alnum: RMQR_COUNT_BITS.alnum[version],
        byte: RMQR_COUNT_BITS.byte[version],
        kanji: RMQR_COUNT_BITS.kanji[version],
      },
    },
    terminatorBits: 3,
    eciCode: 7,
    fnc1Code: 5,
  };
}

export function symbolSpec(type: SymbolType, version: number, ecLevel: EcLevel): SymbolSpec {
  if (type === 'model2') return model2Spec(version, ecLevel);
  if (type === 'micro') return microSpec(version, ecLevel);
  return rmqrSpec(version, ecLevel);
}

export function ecLevelsFor(type: SymbolType, version?: number): EcLevel[] {
  if (type === 'model2') return [...EC_LEVELS];
  if (type === 'rmqr') return ['M', 'H'];
  if (version === undefined) return ['L', 'M', 'Q'];
  return MICRO_TABLE.filter(([v]) => v === version).map(([, l]) => l);
}

export function versionsFor(type: SymbolType): number[] {
  if (type === 'model2') return Array.from({ length: 40 }, (_, i) => i + 1);
  if (type === 'micro') return [1, 2, 3, 4];
  return RMQR_SPECS.map((_, i) => i);
}

export function versionLabel(type: SymbolType, version: number): string {
  if (type === 'model2') return String(version);
  if (type === 'micro') return `M${version}`;
  return RMQR_SPECS[version].name;
}

/** All specs of a type for one EC level, ordered from smallest to largest area. */
export function specsBySize(type: SymbolType, ecLevel: EcLevel): SymbolSpec[] {
  const specs: SymbolSpec[] = [];
  for (const v of versionsFor(type)) {
    if (!ecLevelsFor(type, v).includes(ecLevel)) continue;
    specs.push(symbolSpec(type, v, ecLevel));
  }
  if (type === 'rmqr') specs.sort((a, b) => a.width * a.height - b.width * b.height || a.height - b.height);
  return specs;
}

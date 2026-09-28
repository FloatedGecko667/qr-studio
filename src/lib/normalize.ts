import { ecLevelsFor, versionsFor, type EcLevel, type SymbolType } from './encoder/symbols';
import {
  DEFAULT_OUTPUT,
  DEFAULT_STYLE,
  LIMITS,
  type OutputSettings,
  type StyleSettings,
  type SymbolSettings,
} from './settings';

const clamp = (v: number, [lo, hi]: readonly [number, number]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(v) ? (v as T) : fallback);
const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export const MASK_COUNT: Record<SymbolType, number> = { model2: 8, micro: 4, rmqr: 0 };
export const DEFAULT_QUIET_ZONE: Record<SymbolType, number> = { model2: 4, micro: 2, rmqr: 2 };

function closestEcLevel(type: SymbolType, version: number | 'auto', want: EcLevel): EcLevel {
  const allowed = ecLevelsFor(type, version === 'auto' ? undefined : version);
  if (allowed.includes(want)) return want;
  const order: EcLevel[] = ['L', 'M', 'Q', 'H'];
  const i = order.indexOf(want);
  // Prefer the nearest weaker level, otherwise the nearest stronger one.
  for (let j = i; j >= 0; j--) if (allowed.includes(order[j])) return order[j];
  for (let j = i + 1; j < order.length; j++) if (allowed.includes(order[j])) return order[j];
  return allowed[0];
}

/** Repairs any invalid combination (e.g. after switching symbol type or loading old settings). */
export function normalizeSymbol(s: SymbolSettings): SymbolSettings {
  const type = oneOf(s.type, ['model2', 'micro', 'rmqr'] as const, 'model2');
  let version: number | 'auto' = s.version === 'auto' || !versionsFor(type).includes(s.version) ? 'auto' : s.version;
  let ecLevel = oneOf(s.ecLevel, ['L', 'M', 'Q', 'H'] as const, 'M');
  // Micro QR: keep the version and move the EC level (M1 only has error detection).
  ecLevel = closestEcLevel(type, version, ecLevel);
  if (version !== 'auto' && !ecLevelsFor(type, version).includes(ecLevel)) version = 'auto';
  const masks = MASK_COUNT[type];
  const mask = s.mask === 'auto' || !Number.isInteger(s.mask) || s.mask < 0 || s.mask >= masks ? 'auto' : s.mask;
  return {
    type,
    ecLevel,
    version,
    mask,
    charset: oneOf(s.charset, ['auto', 'sjis', 'utf8'] as const, 'auto'),
    eci: type === 'micro' ? false : s.eci === true,
    structuredAppend:
      type !== 'model2' ? 1 : s.structuredAppend === 'auto' ? 'auto' : Math.round(clamp(Number(s.structuredAppend), [1, 16])),
  };
}

export function normalizeStyle(s: StyleSettings): StyleSettings {
  return {
    quietZone: Math.round(clamp(s.quietZone, LIMITS.quietZone)),
    fg: hex(s.fg, DEFAULT_STYLE.fg),
    bg: hex(s.bg, DEFAULT_STYLE.bg),
    transparent: s.transparent === true,
    overlay: oneOf(s.overlay, ['none', 'logo', 'text'] as const, 'none'),
    overlayRatio: clamp(s.overlayRatio, LIMITS.overlayRatio),
    centerText: Array.from(String(s.centerText)).slice(0, LIMITS.centerTextChars).join(''),
    enclosure: oneOf(s.enclosure, ['circle', 'square', 'none'] as const, 'circle'),
    label: String(s.label).slice(0, LIMITS.labelChars),
    labelPosition: oneOf(s.labelPosition, ['top', 'bottom'] as const, 'bottom'),
    labelColor: hex(s.labelColor, DEFAULT_STYLE.labelColor),
    frameColor: hex(s.frameColor, DEFAULT_STYLE.frameColor),
    frameRadius: clamp(s.frameRadius, LIMITS.frameRadius),
    embedFont: s.embedFont !== false,
  };
}

export function normalizeOutput(s: OutputSettings): OutputSettings {
  return {
    unit: oneOf(s.unit, ['px', 'mm'] as const, 'px'),
    modulePx: Math.round(clamp(s.modulePx, LIMITS.modulePx)),
    sizeMm: clamp(s.sizeMm, LIMITS.sizeMm),
    dpi: Math.round(clamp(s.dpi, LIMITS.dpi)),
    format: oneOf(s.format, ['png', 'jpeg', 'webp', 'svg', 'pdf'] as const, DEFAULT_OUTPUT.format),
    quality: clamp(s.quality, [0.5, 1]),
  };
}

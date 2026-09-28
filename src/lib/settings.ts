import type { EcLevel, SymbolType } from './encoder';
import type { Enclosure, LabelPosition } from './render/svg';
import type { RasterFormat } from './render/raster';
import { DEFAULT_OPTIMIZE, type OptimizeSettings } from './optimize';
import type { GeoProvider } from './geo/search';

export interface SymbolSettings {
  type: SymbolType;
  ecLevel: EcLevel;
  version: number | 'auto';
  mask: number | 'auto';
  charset: 'auto' | 'sjis' | 'utf8';
  eci: boolean;
  /** Number of structured-append symbols (1 = off), or 'auto' for the fewest that fit. */
  structuredAppend: number | 'auto';
}

export type OverlayKind = 'none' | 'logo' | 'text';

export interface StyleSettings {
  quietZone: number;
  fg: string;
  bg: string;
  transparent: boolean;
  overlay: OverlayKind;
  overlayRatio: number;
  centerText: string;
  enclosure: Enclosure;
  label: string;
  labelPosition: LabelPosition;
  labelColor: string;
  frameColor: string;
  frameRadius: number;
  embedFont: boolean;
}

export interface OutputSettings {
  unit: 'px' | 'mm';
  modulePx: number;
  sizeMm: number;
  dpi: number;
  format: RasterFormat | 'svg';
  quality: number;
}

export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'qr' | 'barcode';
export type Locale = 'ja' | 'en';

export interface Settings {
  symbol: SymbolSettings;
  style: StyleSettings;
  output: OutputSettings;
  optimize: OptimizeSettings;
  /** Map / place search service, chosen explicitly by the user. */
  geoProvider: GeoProvider;
  /** QR code or barcode generator, switched by the top tabs. */
  mode: Mode;
  theme: Theme;
  locale: Locale;
}

export const SETTINGS_KEY = 'qr-studio:settings';

export const DEFAULT_SYMBOL: SymbolSettings = {
  type: 'model2',
  ecLevel: 'M',
  version: 'auto',
  mask: 'auto',
  charset: 'auto',
  eci: false,
  structuredAppend: 'auto',
};

export const DEFAULT_STYLE: StyleSettings = {
  quietZone: 4,
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  overlay: 'none',
  overlayRatio: 0.2,
  centerText: '',
  enclosure: 'circle',
  label: '',
  labelPosition: 'bottom',
  labelColor: '#ffffff',
  frameColor: '#000000',
  frameRadius: 2,
  embedFont: true,
};

export const DEFAULT_OUTPUT: OutputSettings = {
  unit: 'px',
  modulePx: 8,
  sizeMm: 30,
  dpi: 350,
  format: 'png',
  quality: 0.92,
};

export const LIMITS = {
  quietZone: [0, 16],
  overlayRatio: [0.1, 0.35],
  centerTextChars: 4,
  labelChars: 30,
  frameRadius: [0, 8],
  modulePx: [1, 50],
  sizeMm: [5, 1000],
  dpi: [72, 1200],
  minModuleMm: 0.25,
} as const;

/** Keeps only known keys whose value has the same type as the default. */
export function mergeKnown<T extends object>(defaults: T, stored: unknown): T {
  const out = { ...defaults };
  if (!stored || typeof stored !== 'object') return out;
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    const v = (stored as Record<string, unknown>)[k as string];
    const d = defaults[k];
    if (v === undefined) continue;
    // 'auto' | number fields accept either form.
    if (typeof v === typeof d || (typeof d === 'string' && d === 'auto' && typeof v === 'number')) out[k] = v as T[keyof T];
  }
  return out;
}

export function detectLocale(): Locale {
  const lang = typeof navigator === 'undefined' ? 'ja' : navigator.language;
  return lang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function loadSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  const locale = s.locale === 'ja' || s.locale === 'en' ? s.locale : detectLocale();
  return {
    symbol: mergeKnown(DEFAULT_SYMBOL, s.symbol),
    style: mergeKnown(DEFAULT_STYLE, s.style),
    output: mergeKnown(DEFAULT_OUTPUT, s.output),
    optimize: mergeKnown(DEFAULT_OPTIMIZE, s.optimize),
    geoProvider: s.geoProvider === 'osm' ? 'osm' : 'gsi',
    mode: s.mode === 'barcode' ? 'barcode' : 'qr',
    theme,
    locale,
  };
}

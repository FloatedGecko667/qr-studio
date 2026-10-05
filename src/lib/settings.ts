import type { FinderShape, Gradient, ModuleShape } from './render/shapes';
import type { EcLevel, SymbolType } from './encoder';
import type { Enclosure, LabelPosition } from './render/svg';
import type { OutputFormat } from './render/raster';
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
  moduleShape: ModuleShape;
  finderOuter: FinderShape;
  finderInner: FinderShape;
  gradient: Gradient;
  /** Second colour of the gradient. */
  fg2: string;
  /** Clear the modules behind the logo (otherwise it is drawn over them). */
  logoClear: boolean;
  /** Make a plain logo background transparent when loading the logo. */
  logoRemoveBg: boolean;
}

export interface OutputSettings {
  unit: 'px' | 'mm';
  modulePx: number;
  sizeMm: number;
  dpi: number;
  format: OutputFormat;
  quality: number;
}

export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'qr' | 'barcode' | 'datamatrix';
export const MODES: Mode[] = ['qr', 'barcode', 'datamatrix'];
export const LOCALES = ['ja', 'en', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'pt', 'it'] as const;
export type Locale = (typeof LOCALES)[number];
/** Each language in its own name, for the language menu. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
};
/** BCP 47 tag for Intl date and number formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
  it: 'it-IT',
};
const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);
/** "simple": input, preview and the main actions only; "detailed": every option. */
export type View = 'simple' | 'detailed';

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
  view: View;
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
  moduleShape: 'square',
  finderOuter: 'square',
  finderInner: 'square',
  gradient: 'none',
  fg2: '#2657d9',
  logoClear: true,
  logoRemoveBg: false,
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

/** Picks the first supported language from the browser's preferences; English otherwise. */
export function detectLocale(
  languages: readonly string[] = typeof navigator === 'undefined'
    ? ['ja']
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): Locale {
  for (const raw of languages) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('zh')) return /^zh-(hant|tw|hk|mo)\b/.test(tag) ? 'zh-Hant' : 'zh-Hans';
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

/**
 * Layout version written with the settings. 1 (no `schema`, before 2026-10) lacks the view, design
 * shape, gradient and logo options and has only ja/en: loading fills them with defaults, so no
 * transformation is needed yet. A later layout change adds its step here.
 */
export const SETTINGS_SCHEMA = 2;

/** What is saved to localStorage: the settings with their layout version. */
export const storedSettings = (s: Settings) => ({ schema: SETTINGS_SCHEMA, ...s });

export function loadSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system';
  const locale = isLocale(s.locale) ? s.locale : detectLocale();
  return {
    symbol: mergeKnown(DEFAULT_SYMBOL, s.symbol),
    style: mergeKnown(DEFAULT_STYLE, s.style),
    output: mergeKnown(DEFAULT_OUTPUT, s.output),
    optimize: mergeKnown(DEFAULT_OPTIMIZE, s.optimize),
    geoProvider: s.geoProvider === 'osm' ? 'osm' : 'gsi',
    mode: MODES.includes(s.mode as Mode) ? (s.mode as Mode) : 'qr',
    theme,
    locale,
    // New users start simple; people who already have settings keep the full screen they know.
    view: s.view === 'simple' || s.view === 'detailed' ? s.view : Object.keys(s).length ? 'detailed' : 'simple',
  };
}

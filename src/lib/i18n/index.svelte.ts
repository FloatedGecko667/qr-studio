import { app } from '../app.svelte';
import { LOCALE_TAGS, type Locale } from '../settings';
import type { ja } from './ja';

export type MessageKey = keyof typeof ja;
/** Every dictionary has exactly the Japanese keys (checked by the type and a unit test). */
export type Messages = Record<MessageKey, string>;

// Dictionaries are separate chunks: only the one in use is downloaded.
const LOADERS: Record<Locale, () => Promise<Messages>> = {
  ja: () => import('./ja').then((m) => m.ja),
  en: () => import('./en').then((m) => m.en),
  'zh-Hans': () => import('./zh-Hans').then((m) => m.zhHans),
  'zh-Hant': () => import('./zh-Hant').then((m) => m.zhHant),
  fr: () => import('./fr').then((m) => m.fr),
  de: () => import('./de').then((m) => m.de),
  es: () => import('./es').then((m) => m.es),
  pt: () => import('./pt').then((m) => m.pt),
  it: () => import('./it').then((m) => m.it),
};

let dict: Record<string, string> = $state.raw({});
let current: Locale | null = null;
let pending: Promise<void> | null = null;

/**
 * Loads the dictionary for `locale`. The previous one stays on screen until it arrives, so a
 * switch never flashes raw keys. Called before mounting, and whenever the locale changes.
 */
export function loadLocale(locale: Locale): Promise<void> {
  if (locale === current) return pending ?? Promise.resolve();
  current = locale;
  const p = LOADERS[locale]().then((d) => {
    // A later switch wins over a slower earlier one.
    if (current === locale) dict = d;
  });
  pending = p;
  return p;
}

/** Translates `key`, replacing `{name}` placeholders. Unknown keys fall back to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(localeTag());
}

/** BCP 47 tag of the current language, for Intl formatting. */
export function localeTag(): string {
  return LOCALE_TAGS[app.settings.locale];
}

import { app } from '../app.svelte';
import type { Locale } from '../settings';
import type { ja } from './ja';

export type MessageKey = keyof typeof ja;
/** Every dictionary has exactly the Japanese keys (checked by the type and a unit test). */
export type Messages = Record<MessageKey, string>;

// Dictionaries are separate chunks: only the one in use is downloaded.
const LOADERS: Record<Locale, () => Promise<Messages>> = {
  ja: () => import('./ja').then((m) => m.ja),
  en: () => import('./en').then((m) => m.en),
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
  return n.toLocaleString(app.settings.locale === 'ja' ? 'ja-JP' : 'en-US');
}

import { app } from '../app.svelte';
import { en } from './en';
import { ja } from './ja';

export type Messages = typeof ja;
const DICTS: Record<'ja' | 'en', Messages> = { ja, en };

/** Translates `key`, replacing `{name}` placeholders. Unknown keys fall back to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[app.settings.locale];
  let s = (dict as Record<string, string>)[key] ?? (ja as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(app.settings.locale === 'ja' ? 'ja-JP' : 'en-US');
}

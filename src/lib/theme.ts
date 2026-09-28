import type { Theme } from './settings';

const COLORS = { light: '#f6f7f9', dark: '#111317' } as const;

/** Applies the theme to <html> and keeps the browser UI colour (theme-color) in sync. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = theme === 'system' ? COLORS[scheme] : COLORS[theme];
  }
}

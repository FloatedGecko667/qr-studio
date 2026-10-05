import { MODES, type Mode } from './settings';

export const TABS = ['generate', 'batch', 'scan', 'history'] as const;
export type Tab = (typeof TABS)[number];

/**
 * Screen requested by an app shortcut (`?mode=barcode&tab=scan`) or the share target. Only these
 * navigation parameters are read, and unknown values are ignored; input content is never taken from the URL.
 */
export function launchTarget(search: string): { mode?: Mode; tab?: Tab; shared?: 'files' | 'error' } {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const tab = params.get('tab');
  const shared = params.get('shared');
  return {
    mode: (MODES as readonly string[]).includes(mode ?? '') ? (mode as Mode) : undefined,
    tab: (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : undefined,
    // Set by the share target (public/share-target-sw.js); the images themselves are in Cache Storage.
    shared: shared === '1' ? 'files' : shared === 'error' ? 'error' : undefined,
  };
}

/** Removes the shortcut parameters so a reload or bookmark does not keep forcing the screen. */
export function clearLaunchParams(): void {
  const url = new URL(location.href);
  const keys = ['mode', 'tab', 'shared'];
  if (!keys.some((k) => url.searchParams.has(k))) return;
  for (const k of keys) url.searchParams.delete(k);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

import { MODES, type Mode } from './settings';

export const TABS = ['generate', 'batch', 'scan', 'history'] as const;
export type Tab = (typeof TABS)[number];

/**
 * Screen requested by an app shortcut (`?mode=barcode&tab=scan`). Only these two navigation
 * parameters are read, and unknown values are ignored; input content is never taken from the URL.
 */
export function launchTarget(search: string): { mode?: Mode; tab?: Tab } {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const tab = params.get('tab');
  return {
    mode: (MODES as readonly string[]).includes(mode ?? '') ? (mode as Mode) : undefined,
    tab: (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : undefined,
  };
}

/** Removes the shortcut parameters so a reload or bookmark does not keep forcing the screen. */
export function clearLaunchParams(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('mode') && !url.searchParams.has('tab')) return;
  url.searchParams.delete('mode');
  url.searchParams.delete('tab');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

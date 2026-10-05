// Keyboard shortcut matching. Shortcuts never fire while typing in a text field, so the field's
// own undo, copy and so on keep working there.

const TEXT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);

/** True for elements where keys type text (their native undo and shortcuts take priority). */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return TEXT_TYPES.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const isMac = (platform: string) => /mac|iphone|ipad/i.test(platform);

/** ⌘ on Apple devices, Ctrl elsewhere, without the other one. */
export const primary = (e: KeyLike, mac: boolean) => (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);

/** ⌘Z / Ctrl+Z undo; ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo. */
export function undoAction(e: KeyLike, mac: boolean): 'undo' | 'redo' | null {
  if (!primary(e, mac) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !mac && !e.shiftKey) return 'redo';
  return null;
}

export interface CodeKey extends KeyLike {
  /** Physical key (KeyC, Digit1, Slash): ⌥ changes `key` on Apple keyboards. */
  code: string;
}

export type Shortcut =
  | { type: 'save' | 'copy' | 'print' | 'help' }
  | { type: 'tab'; index: number }
  | { type: 'mode'; mode: 'qr' | 'barcode' | 'datamatrix' };

const MODE_KEYS: Record<string, 'qr' | 'barcode' | 'datamatrix'> = { KeyQ: 'qr', KeyB: 'barcode', KeyD: 'datamatrix' };

/**
 * ⌘S / Ctrl+S saves (also while typing). The rest use ⌥⇧ / Alt+Shift, which no major browser
 * claims: C copy the image, P print, 1–4 tabs, Q/B/D modes, / this list.
 */
export function shortcutAction(e: CodeKey, mac: boolean, typing: boolean): Shortcut | null {
  if (primary(e, mac) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') return { type: 'save' };
  if (typing || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  if (e.code === 'KeyC') return { type: 'copy' };
  if (e.code === 'KeyP') return { type: 'print' };
  if (e.code === 'Slash') return { type: 'help' };
  const digit = /^Digit([1-4])$/.exec(e.code);
  if (digit) return { type: 'tab', index: Number(digit[1]) - 1 };
  if (e.code in MODE_KEYS) return { type: 'mode', mode: MODE_KEYS[e.code] };
  return null;
}

import { describe, expect, it } from 'vitest';
import { isMac, shortcutAction, undoAction, type CodeKey, type KeyLike } from './keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('undoAction', () => {
  it('uses ⌘ on Apple devices', () => {
    expect(undoAction(key('z', { metaKey: true }), true)).toBe('undo');
    expect(undoAction(key('Z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
    expect(undoAction(key('z', { ctrlKey: true }), true)).toBeNull();
    expect(undoAction(key('y', { metaKey: true }), true)).toBeNull();
  });

  it('uses Ctrl elsewhere, with Ctrl+Y as redo', () => {
    expect(undoAction(key('z', { ctrlKey: true }), false)).toBe('undo');
    expect(undoAction(key('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(undoAction(key('y', { ctrlKey: true }), false)).toBe('redo');
    expect(undoAction(key('z', { metaKey: true }), false)).toBeNull();
    expect(undoAction(key('z', { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(undoAction(key('z'), false)).toBeNull();
  });

  it('detects Apple platforms', () => {
    expect(isMac('MacIntel')).toBe(true);
    expect(isMac('iPhone')).toBe(true);
    expect(isMac('Win32')).toBe(false);
    expect(isMac('Linux x86_64')).toBe(false);
  });
});

describe('shortcutAction', () => {
  const k = (code: string, mods: Partial<KeyLike> = {}, keyName = ''): CodeKey => ({ ...key(keyName, mods), code });

  it('saves with ⌘S / Ctrl+S, even while typing', () => {
    expect(shortcutAction(k('KeyS', { metaKey: true }, 's'), true, true)).toEqual({ type: 'save' });
    expect(shortcutAction(k('KeyS', { ctrlKey: true }, 's'), false, false)).toEqual({ type: 'save' });
    expect(shortcutAction(k('KeyS', { ctrlKey: true, shiftKey: true }, 'S'), false, false)).toBeNull();
  });

  it('maps ⌥⇧ / Alt+Shift keys by physical key', () => {
    const alt = { altKey: true, shiftKey: true };
    // On a Mac ⌥⇧C types "Ç": the physical key still counts.
    expect(shortcutAction(k('KeyC', alt, 'Ç'), true, false)).toEqual({ type: 'copy' });
    expect(shortcutAction(k('KeyP', alt, 'P'), false, false)).toEqual({ type: 'print' });
    expect(shortcutAction(k('Digit3', alt, '#'), false, false)).toEqual({ type: 'tab', index: 2 });
    expect(shortcutAction(k('Digit5', alt, '%'), false, false)).toBeNull();
    expect(shortcutAction(k('KeyB', alt, 'B'), false, false)).toEqual({ type: 'mode', mode: 'barcode' });
    expect(shortcutAction(k('Slash', alt, '?'), false, false)).toEqual({ type: 'help' });
  });

  it('leaves keys alone while typing or with other modifiers', () => {
    const alt = { altKey: true, shiftKey: true };
    expect(shortcutAction(k('KeyC', alt, 'Ç'), true, true)).toBeNull();
    expect(shortcutAction(k('KeyC', { ...alt, ctrlKey: true }, 'C'), false, false)).toBeNull();
    expect(shortcutAction(k('KeyC', { altKey: true }, 'c'), false, false)).toBeNull();
    expect(shortcutAction(k('Slash', { shiftKey: true }, '?'), false, false)).toBeNull();
  });
});

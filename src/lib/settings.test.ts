import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT, loadSettings } from './settings';

describe('loadSettings', () => {
  it('starts new users in the simple view and keeps existing users on the detailed one', () => {
    expect(loadSettings(null).view).toBe('simple');
    expect(loadSettings({}).view).toBe('simple');
    // Settings saved before the view existed (an older version).
    expect(loadSettings({ theme: 'dark', output: { format: 'svg' } }).view).toBe('detailed');
    expect(loadSettings({ view: 'simple', theme: 'dark' }).view).toBe('simple');
    expect(loadSettings({ view: 'odd' }).view).toBe('detailed');
  });

  it('fills fields added later with their defaults', () => {
    const s = loadSettings({ output: { format: 'svg' } });
    expect(s.output).toEqual({ ...DEFAULT_OUTPUT, format: 'svg' });
    expect(s.theme).toBe('system');
  });
});

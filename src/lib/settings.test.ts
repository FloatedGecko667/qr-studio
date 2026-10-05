import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT, detectLocale, loadSettings, LOCALES } from './settings';

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

describe('detectLocale', () => {
  it('picks the first supported browser language', () => {
    expect(detectLocale(['ja-JP'])).toBe('ja');
    expect(detectLocale(['de-AT', 'en'])).toBe('de');
    expect(detectLocale(['ko-KR', 'fr-CA'])).toBe('fr');
    expect(detectLocale(['pt-PT'])).toBe('pt');
    expect(detectLocale(['ko-KR'])).toBe('en');
  });

  it('separates simplified and traditional Chinese', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-Hans');
    expect(detectLocale(['zh'])).toBe('zh-Hans');
    expect(detectLocale(['zh-Hans-SG'])).toBe('zh-Hans');
    expect(detectLocale(['zh-TW'])).toBe('zh-Hant');
    expect(detectLocale(['zh-HK'])).toBe('zh-Hant');
    expect(detectLocale(['zh-Hant'])).toBe('zh-Hant');
  });

  it('keeps a stored locale and drops unknown ones', () => {
    expect(loadSettings({ locale: 'it' }).locale).toBe('it');
    expect(loadSettings({ locale: 'zh-Hant' }).locale).toBe('zh-Hant');
    expect(LOCALES).toContain(loadSettings({ locale: 'xx' }).locale);
  });
});

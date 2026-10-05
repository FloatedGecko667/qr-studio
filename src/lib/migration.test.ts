// Data saved by earlier versions (before 2026-10, layout 1: no `schema`) must load with the new
// fields at their defaults and the user's values kept.
import { describe, expect, it } from 'vitest';
import { BARCODE_SCHEMA, loadBarcodeSettings, storedBarcodeSettings } from './barcode/settings';
import { restoreFields } from './payload/forms';
import { normalizeScanPrefs } from './scanLogState.svelte';
import { DEFAULT_STYLE, loadSettings, SETTINGS_SCHEMA, storedSettings } from './settings';
import { normalizeStyle } from './normalize';

/** QR settings as written in 2026-09 (no view, design shapes, gradient or logo options). */
const V1_SETTINGS = {
  symbol: { type: 'model2', ecLevel: 'H', version: 'auto', mask: 'auto', charset: 'auto', eci: false, structuredAppend: 'auto' },
  style: {
    quietZone: 4,
    fg: '#112233',
    bg: '#ffffee',
    transparent: false,
    overlay: 'text',
    overlayRatio: 0.2,
    centerText: 'AB',
    enclosure: 'circle',
    label: 'SCAN ME',
    labelPosition: 'bottom',
    labelColor: '#ffffff',
    frameColor: '#000000',
    frameRadius: 2,
    embedFont: true,
  },
  output: { unit: 'mm', modulePx: 8, sizeMm: 40, dpi: 600, format: 'pdf', quality: 0.92 },
  optimize: { uppercaseUrl: true, halfwidth: false, compactContact: false, deflate: false },
  geoProvider: 'osm',
  mode: 'barcode',
  theme: 'dark',
  locale: 'en',
};

describe('settings layout 1 → 2', () => {
  it('keeps the old values and adds the new ones at their defaults', () => {
    const s = loadSettings(V1_SETTINGS);
    expect(s.style).toEqual({
      ...V1_SETTINGS.style,
      moduleShape: 'square',
      finderOuter: 'square',
      finderInner: 'square',
      gradient: 'none',
      fg2: DEFAULT_STYLE.fg2,
      logoClear: true,
      logoRemoveBg: false,
    });
    expect(s.symbol.ecLevel).toBe('H');
    expect(s.output).toMatchObject({ unit: 'mm', sizeMm: 40, dpi: 600, format: 'pdf' });
    expect(s).toMatchObject({ geoProvider: 'osm', mode: 'barcode', theme: 'dark', locale: 'en' });
    // People who used the app before the simple view keep the full screen.
    expect(s.view).toBe('detailed');
  });

  it('saves with the layout version and reads back the same', () => {
    const saved = JSON.parse(JSON.stringify(storedSettings(loadSettings(V1_SETTINGS))));
    expect(saved.schema).toBe(SETTINGS_SCHEMA);
    expect(loadSettings(saved)).toEqual(loadSettings(V1_SETTINGS));
  });

  it('a preset saved with the old style still applies completely', () => {
    expect(normalizeStyle({ ...DEFAULT_STYLE, ...V1_SETTINGS.style } as never)).toMatchObject({ fg: '#112233', moduleShape: 'square', gradient: 'none' });
  });
});

describe('other stored data from layout 1', () => {
  it('barcode settings', () => {
    const s = loadBarcodeSettings({ type: 'code128', options: { checkDigit: true }, style: { height: 40 }, output: { unit: 'mm' } });
    expect(s.type).toBe('code128');
    expect(s.style.height).toBe(40);
    expect(s.output.unit).toBe('mm');
    expect(storedBarcodeSettings(s).schema).toBe(BARCODE_SCHEMA);
  });

  it('input templates get the new fields (time zone, UTM)', () => {
    expect(restoreFields('event', { summary: '会議', allDay: false, start: '2026-01-01T10:00', end: '', location: '', description: '' })).toMatchObject({
      summary: '会議',
      timeZone: 'floating',
    });
    expect(restoreFields('url', { url: 'https://example.com/a' })).toEqual({
      url: 'https://example.com/a',
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
    });
  });

  it('scan preferences without a chosen camera', () => {
    expect(normalizeScanPrefs({ continuous: true, mode: 'count', beep: true })).toEqual({ continuous: true, mode: 'count', beep: true, deviceId: '' });
  });
});

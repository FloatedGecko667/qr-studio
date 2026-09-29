import { describe, expect, it } from 'vitest';
import { FORMS } from '../payload/forms';
import { secretKeys, templateFields } from './templates';

describe('templateFields', () => {
  it('drops the Wi-Fi password unless asked to keep it', () => {
    const values = { ssid: 'Office', auth: 'WPA', password: 'secret', hidden: true };
    expect(secretKeys('wifi')).toEqual(['password']);
    expect(templateFields('wifi', values, false)).toEqual({ ssid: 'Office', auth: 'WPA', password: '', hidden: true });
    expect(templateFields('wifi', values, true)).toMatchObject({ password: 'secret' });
  });

  it('keeps only known fields with the right types', () => {
    const out = templateFields('url', { url: 'https://example.org/a', extra: 'x', url2: 1 } as never, false);
    expect(out).toEqual({ url: 'https://example.org/a' });
    // A wrong type falls back to the form default.
    expect(templateFields('url', { url: 42 } as never, false)).toEqual({ url: FORMS.url.defaults.url });
  });
});

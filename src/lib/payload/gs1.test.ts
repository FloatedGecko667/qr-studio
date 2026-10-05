import { describe, expect, it } from 'vitest';
import { buildDigitalLink, encodeDl, gs1Date, parseAiString, parseDigitalLink } from './gs1';
import { buildGs1, buildGs1DigitalLink } from './index';

describe('GS1 element strings', () => {
  it('parses AI pairs and rejects stray text', () => {
    expect(parseAiString('(01)04912345123459 (10)AB C')).toEqual([
      ['01', '04912345123459'],
      ['10', 'ABC'],
    ]);
    expect(parseAiString('01)0491')).toBeNull();
    expect(parseAiString('(01)0491x(10)')).toBeNull();
  });

  it('still builds FNC1 element strings', () => {
    expect(buildGs1({ value: '(01)04912345123459(10)ABC(17)271231' }).text).toBe('0104912345123459' + '10ABC\x1d' + '17271231');
  });
});

describe('GS1 Digital Link', () => {
  const link = (s: string, domain = '') => buildDigitalLink(parseAiString(s)!, domain);

  it('puts the key and qualifiers in the path in the standard order, other AIs in the query', () => {
    expect(link('(17)271231(21)S/1(10)AB&C(01)04912345123459')).toEqual({
      ok: true,
      url: 'https://id.gs1.org/01/04912345123459/10/AB%26C/21/S%2F1?17=271231',
      warnings: [],
    });
  });

  it('pads GTIN-13/12/8 to 14 digits and keeps a custom resolver path', () => {
    const r = link('(01)4912345123459', 'https://example.com/dl/');
    expect(r).toMatchObject({ ok: true, url: 'https://example.com/dl/01/04912345123459' });
  });

  it('warns about a wrong check digit and refuses invalid keys', () => {
    expect(link('(01)04912345123450')).toMatchObject({ ok: true, warnings: ['payload.gs1.checkDigit'] });
    expect(link('(01)123')).toEqual({ ok: false, error: 'payload.gs1dl.keyFormat' });
    expect(link('(10)ABC')).toEqual({ ok: false, error: 'payload.gs1dl.noKey' });
    expect(link('(01)04912345123459(00)123456789012345675')).toEqual({ ok: false, error: 'payload.gs1dl.twoKeys' });
    expect(link('(01)04912345123459', 'ftp://x')).toEqual({ ok: false, error: 'payload.gs1dl.domain' });
    expect(link('(01)04912345123459', 'https://x/?a=1')).toEqual({ ok: false, error: 'payload.gs1dl.domain' });
  });

  it('encodes reserved characters as RFC 3986 requires', () => {
    expect(encodeDl("a!'()*~b")).toBe('a%21%27%28%29%2A~b');
  });

  it('reads a Digital Link back, on any domain', () => {
    expect(parseDigitalLink('https://example.com/dl/01/04912345123459/10/AB%26C/21/S%2F1%202?17=271231&x=1')).toEqual([
      ['01', '04912345123459'],
      ['10', 'AB&C'],
      ['21', 'S/1 2'],
      ['17', '271231'],
    ]);
    expect(parseDigitalLink('https://example.com/01/123')).toBeNull();
    expect(parseDigitalLink('https://example.com/about')).toBeNull();
    // A qualifier that does not belong to the key is not a Digital Link path.
    expect(parseDigitalLink('https://example.com/01/04912345123459/99/x')).toBeNull();
  });

  it('round-trips through the form builder', () => {
    const p = buildGs1DigitalLink({ value: '(01)04912345123459(10)LOT1', domain: 'https://id.gs1.org' });
    expect(p.text).toBe('https://id.gs1.org/01/04912345123459/10/LOT1');
    expect(parseDigitalLink(p.text!)).toEqual([
      ['01', '04912345123459'],
      ['10', 'LOT1'],
    ]);
  });

  it('shows YYMMDD dates in full', () => {
    expect(gs1Date('17', '271231')).toBe('2027-12-31');
    expect(gs1Date('10', '271231')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { printCss, toMm } from './print';

describe('print', () => {
  it('converts size attributes to millimetres (pixels at 96 dpi)', () => {
    expect(toMm('30mm')).toBe(30);
    expect(toMm('96')).toBeCloseTo(25.4);
  });

  it('sizes the page to the largest item with no margin', () => {
    const css = printCss([
      { svg: '', svgAttr: { width: '30mm', height: '35.5mm' } },
      { svg: '', svgAttr: { width: '25mm', height: '40mm' } },
    ]);
    expect(css).toContain('@page { size: 30mm 40mm; margin: 0; }');
    expect(css).toContain('body > :not(#qr-print-root) { display: none !important; }');
  });
});

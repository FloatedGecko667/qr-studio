import { describe, expect, it } from 'vitest';
import { colorIssues, contrastRatio } from './color';
import { composeSheet, outputSize, withSize } from './output';
import { crc32, withPngDpi } from './png';
import { escapeXml, modulesPath, overlayBox, overlayCoverage, renderSvg, safeColor, type RenderStyle } from './svg';

const grid = { width: 3, height: 3, modules: Uint8Array.from([1, 1, 0, 0, 1, 0, 1, 1, 1]) };
const style: RenderStyle = {
  quietZone: 2,
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  overlayRatio: 0,
  logoDataUrl: null,
  centerText: '',
  enclosure: 'circle',
  label: '',
  labelPosition: 'bottom',
  labelColor: '#ffffff',
  frameColor: '#000000',
  frameRadius: 2,
  fontFamily: 'JetBrains Mono Variable',
  fontDataUrl: null,
};

describe('svg rendering', () => {
  it('merges horizontal runs', () => {
    expect(modulesPath(grid, 0, 0)).toBe('M0 0h2v1h-2zM1 1h1v1h-1zM0 2h3v1h-3z');
  });

  it('adds quiet zone and label band to the size', () => {
    expect(renderSvg(grid, style)).toMatchObject({ widthUnits: 7, heightUnits: 7 });
    expect(renderSvg(grid, { ...style, label: 'SCAN ME' })).toMatchObject({ widthUnits: 9, heightUnits: 14 });
  });

  it('escapes user text and rejects non-hex colours', () => {
    const { svg } = renderSvg(grid, { ...style, label: '<script>"x"</script>', fg: 'red;"><script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&#60;script&#62;');
    expect(svg).toContain('fill="#000000"');
    expect(escapeXml(`a&b'`)).toBe('a&#38;b&#39;');
    expect(safeColor('#abc', '#000')).toBe('#abc');
    expect(safeColor('url(x)', '#000')).toBe('#000');
  });

  it('centres the overlay on the module grid', () => {
    const g = { width: 21, height: 21, modules: new Uint8Array(441) };
    expect(overlayBox(g, 0.2)).toEqual({ x: 8, y: 8, size: 5 });
    expect(overlayCoverage(g, 0.2)).toBeCloseTo(25 / 441);
    expect(overlayBox(g, 0)).toBeNull();
  });
});

describe('output sizing', () => {
  const out = { unit: 'px', modulePx: 8, sizeMm: 30, dpi: 300, format: 'png', quality: 0.9 } as const;
  it('computes pixel and physical sizes', () => {
    expect(outputSize({ widthUnits: 29, heightUnits: 29 }, out)).toMatchObject({ pxWidth: 232, pxHeight: 232, moduleMm: null });
    const mm = outputSize({ widthUnits: 30, heightUnits: 30 }, { ...out, unit: 'mm' });
    expect(mm).toMatchObject({ pxWidth: 354, pxHeight: 354, moduleMm: 1, svgAttr: { width: '30mm', height: '30mm' } });
  });

  it('composes sheets and sets size attributes', () => {
    const a = { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>', widthUnits: 10, heightUnits: 10 };
    const sheet = composeSheet([a, a, a], 2, 2);
    expect(sheet).toMatchObject({ widthUnits: 22, heightUnits: 22 });
    expect(sheet.svg).toContain('<svg x="12" y="0"');
    expect(withSize(a.svg, { width: '5mm', height: '5mm' })).toMatch(/^<svg width="5mm" height="5mm" /);
  });
});

describe('colour checks', () => {
  it('flags low contrast and inverted colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(colorIssues('#000000', '#ffffff', false)).toEqual([]);
    expect(colorIssues('#777777', '#888888', false)).toContain('lowContrast');
    expect(colorIssues('#ffffff', '#000000', false)).toContain('inverted');
  });

  it('names colour pairs that differ only in hue, not in brightness', () => {
    // Red on green and blue on red look different but have similar brightness.
    expect(colorIssues('#d00000', '#00a000', false)).toEqual(['hueOnly']);
    expect(colorIssues('#0000ff', '#ff0000', false)).toEqual(['hueOnly']);
    // Grey on grey is plain low contrast.
    expect(colorIssues('#666666', '#7a7a7a', false)).toEqual(['lowContrast']);
    // Dark blue on light yellow differs in hue and brightness: fine.
    expect(colorIssues('#1a237e', '#fff59d', false)).toEqual([]);
    // With a gradient the worst stop decides.
    expect(colorIssues(['#000000', '#d00000'], '#00a000', false)).toEqual(['hueOnly']);
  });
});

describe('png dpi', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('inserts a pHYs chunk after IHDR', () => {
    const png = new Uint8Array(8 + 25 + 12);
    const out = withPngDpi(png, 300);
    expect(out.length).toBe(png.length + 21);
    expect(new TextDecoder().decode(out.subarray(37, 41))).toBe('pHYs');
    expect(new DataView(out.buffer).getUint32(41)).toBe(11811);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_BARCODE_OPTIONS, encodeBarcode, type LinearSymbol } from './index';
import { BEARER_WIDTH, renderBarcodeSvg } from './render';
import { barcodeSize, DEFAULT_BARCODE_OUTPUT, DEFAULT_BARCODE_STYLE, loadBarcodeSettings } from './settings';

function sym(type: Parameters<typeof encodeBarcode>[0], value: string): LinearSymbol {
  const r = encodeBarcode(type, value, DEFAULT_BARCODE_OPTIONS);
  if (!r.ok) throw new Error(r.error);
  return r.symbol;
}

describe('renderBarcodeSvg', () => {
  it('escapes the human-readable text and validates colours', () => {
    const r = renderBarcodeSvg(sym('code128', '<a href="x">&'), { ...DEFAULT_BARCODE_STYLE, fg: 'red;"', bg: '#fff"' });
    expect(r.svg).not.toContain('<a ');
    expect(r.svg).toContain('&#60;a href=&#34;x&#34;&#62;&#38;');
    expect(r.svg).toContain('fill="#000000"');
    expect(r.svg).not.toContain('red;');
  });

  it('adds the standard quiet zones and vertical layout', () => {
    const s = sym('code128', 'ABC');
    const r = renderBarcodeSvg(s, DEFAULT_BARCODE_STYLE);
    expect(r.widthUnits).toBe(s.width + 20);
    const { marginY, height, fontSize, textGap } = DEFAULT_BARCODE_STYLE;
    expect(r.heightUnits).toBe(marginY * 2 + height + fontSize + textGap);
    const bare = renderBarcodeSvg(s, { ...DEFAULT_BARCODE_STYLE, showText: false, quietZone: 0, marginY: 0 });
    expect([bare.widthUnits, bare.heightUnits]).toEqual([s.width, height]);
    expect(bare.svg).not.toContain('<text');
  });

  it('keeps EAN digits outside the guards inside the image', () => {
    const r = renderBarcodeSvg(sym('upca', '03600029145'), { ...DEFAULT_BARCODE_STYLE, quietZone: 0 });
    // The number system digit sits left of the start guard, so the left margin grows.
    expect(r.widthUnits).toBeGreaterThan(95 + 2);
    expect((r.svg.match(/<text/g) ?? []).length).toBe(12);
  });

  it('draws bearer bars and frames', () => {
    const s = sym('itf14', '1490123456789');
    const plain = renderBarcodeSvg(s, DEFAULT_BARCODE_STYLE);
    const frame = renderBarcodeSvg(s, { ...DEFAULT_BARCODE_STYLE, bearer: 'frame' });
    expect(frame.widthUnits - plain.widthUnits).toBe(BEARER_WIDTH * 2);
    expect(frame.heightUnits - plain.heightUnits).toBe(BEARER_WIDTH * 2);
  });

  it('keeps bars on whole modules and clear of bearer bars', () => {
    const s = sym('ean13', '490123456789');
    const odd = renderBarcodeSvg(s, { ...DEFAULT_BARCODE_STYLE, fontSize: 22.5 });
    expect(Number.isInteger(odd.widthUnits)).toBe(true);
    const bars = renderBarcodeSvg(s, { ...DEFAULT_BARCODE_STYLE, bearer: 'bars' });
    // Bars and bearers are separate paths; only the bearer path uses evenodd.
    const paths = bars.svg.match(/<path [^>]*>/g) ?? [];
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toContain('evenodd');
  });

  it('embeds the font only when asked', () => {
    const s = sym('code39', 'ABC');
    expect(renderBarcodeSvg(s, DEFAULT_BARCODE_STYLE).svg).not.toContain('@font-face');
    expect(renderBarcodeSvg(s, DEFAULT_BARCODE_STYLE, 'data:font/woff2;base64,AA').svg).toContain('@font-face');
    expect(renderBarcodeSvg(s, { ...DEFAULT_BARCODE_STYLE, font: 'sans' }, 'data:font/woff2;base64,AA').svg).not.toContain('@font-face');
  });
});

describe('barcodeSize', () => {
  const r = { widthUnits: 115, heightUnits: 71 };

  it('uses whole pixels per module', () => {
    expect(barcodeSize(r, { ...DEFAULT_BARCODE_OUTPUT, unit: 'px', modulePx: 3 })).toMatchObject({ pxWidth: 345, pxHeight: 213, dotsPerModule: 3 });
  });

  it('rounds the X dimension to the printer dot grid in mm mode', () => {
    const s = barcodeSize(r, { ...DEFAULT_BARCODE_OUTPUT, unit: 'mm', moduleMm: 0.33, dpi: 300 });
    expect(s.dotsPerModule).toBe(4);
    expect(s.rasterModuleMm).toBeCloseTo(0.3387, 4);
    expect(s.svgAttr).toEqual({ width: '37.95mm', height: '23.43mm' });
  });
});

describe('loadBarcodeSettings', () => {
  it('repairs unknown or out-of-range values', () => {
    const s = loadBarcodeSettings({ type: 'nope', style: { height: 9999, quietZone: 3.4, font: 'comic', fg: 'blue' }, options: { wideRatio: 7 } });
    expect(s.type).toBe('code128');
    expect(s.style).toMatchObject({ height: 300, quietZone: 3, font: 'jetbrains', fg: '#000000' });
    expect(s.options.wideRatio).toBe(3);
    expect(loadBarcodeSettings({ style: { quietZone: 'auto' } }).style.quietZone).toBe('auto');
  });
});

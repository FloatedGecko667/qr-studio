import { describe, expect, it } from 'vitest';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';
import '../../test/decode';
import { ghostscript, hasGs } from '../../test/ghostscript';
import { encode, prepareText, type EncodeOptions } from '../encoder';
import { writePdf } from '../export/pdf';
import { vectorizeSvg } from '../export/vector';
import { FINDER_SHAPES, MODULE_SHAPES, finderOrigins, type FinderShape, type Gradient, type ModuleShape } from './shapes';
import { renderSvg, type RenderStyle } from './svg';
import { renderStyle } from '../compose';
import { DEFAULT_STYLE } from '../settings';
import { DESIGN_TEMPLATES } from './designs';

const BASE: RenderStyle = {
  quietZone: 4,
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  overlayRatio: 0,
  logoDataUrl: null,
  centerText: '',
  enclosure: 'none',
  label: '',
  labelPosition: 'bottom',
  labelColor: '#ffffff',
  frameColor: '#000000',
  frameRadius: 2,
  fontFamily: 'JetBrains Mono',
  fontDataUrl: null,
};

const sym = (text: string, opts: Partial<EncodeOptions> = {}) =>
  encode(prepareText(text).units, { type: 'model2', ecLevel: 'M', version: 'auto', mask: 'auto', ...opts }).symbols[0];

describe('shapes in the SVG', () => {
  it('leaves the default output unchanged', () => {
    const s = sym('hello');
    const plain = renderSvg(s, BASE).svg;
    expect(renderSvg(s, { ...BASE, moduleShape: 'square', finderOuter: 'square', finderInner: 'square', gradient: 'none' }).svg).toBe(plain);
    expect(plain.match(/<path/g)).toHaveLength(1);
  });

  it('finds the finder patterns of each symbol type', () => {
    expect(finderOrigins(sym('hello'))).toEqual([
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 0, y: 14 },
    ]);
    expect(finderOrigins(sym('1', { type: 'micro', ecLevel: 'L' }))).toEqual([{ x: 0, y: 0 }]);
  });

  it('keeps the single finder of micro QR and rMQR square', () => {
    const style = { ...BASE, finderOuter: 'circle' as const, finderInner: 'circle' as const };
    expect(renderSvg(sym('1', { type: 'micro', ecLevel: 'L' }), style).svg).toBe(renderSvg(sym('1', { type: 'micro', ecLevel: 'L' }), BASE).svg);
  });

  it('draws finders separately and defines the gradient once', () => {
    const svg = renderSvg(sym('hello'), { ...BASE, moduleShape: 'dot', finderOuter: 'circle', finderInner: 'rounded', gradient: 'radial', fg2: '#3355ff' }).svg;
    expect(svg.match(/<radialGradient /g)).toHaveLength(1);
    expect(svg.match(/fill="url\(#qr-fg-\w+\)"/g)).toHaveLength(2);
    expect(svg).toContain('fill-rule="evenodd"');
  });
});

/** Renders through the vector PDF path and Ghostscript, then decodes with zxing-cpp. */
async function readBack(style: RenderStyle, opts: Partial<EncodeOptions>, text: string): Promise<string | undefined> {
  const r = renderSvg(sym(text, opts), style);
  const v = vectorizeSvg(r.svg);
  // Labels are text (overlay); they do not take part in decoding.
  if (!style.label) expect(v.overlay).toBeNull();
  const pdf = writePdf([{ widthPt: r.widthUnits * 4, heightPt: r.heightUnits * 4, vector: v }]);
  const [res] = await readBarcodesFromImageData(ghostscript(pdf, 108), { formats: ['QRCode', 'MicroQRCode', 'rMQRCode'], tryHarder: true });
  return res?.text;
}

describe.skipIf(!hasGs)('every shape reads back (vector PDF → Ghostscript → zxing-cpp)', () => {
  const TEXT = 'https://example.com/shapes-0123456789';
  for (const shape of MODULE_SHAPES) {
    for (const finder of FINDER_SHAPES) {
      it(`model 2, ${shape} modules, ${finder} finders`, async () => {
        const style = { ...BASE, moduleShape: shape as ModuleShape, finderOuter: finder as FinderShape, finderInner: finder as FinderShape };
        expect(await readBack(style, {}, TEXT)).toBe(TEXT);
        expect(await readBack(style, { version: 10, ecLevel: 'H' }, TEXT)).toBe(TEXT);
      });
    }
    // Their single finder pattern stays square whatever the finder setting.
    it(`micro QR and rMQR, ${shape} modules`, async () => {
      const style = { ...BASE, moduleShape: shape as ModuleShape, finderOuter: 'rounded' as const, finderInner: 'circle' as const };
      expect(await readBack(style, { type: 'micro', ecLevel: 'M' }, '12345')).toBe('12345');
      expect(await readBack(style, { type: 'rmqr', ecLevel: 'M' }, 'rMQR shapes')).toBe('rMQR shapes');
    });
  }

  for (const d of DESIGN_TEMPLATES) {
    it(`template "${d.id}"`, async () => {
      const style = renderStyle({ ...DEFAULT_STYLE, ...d.style }, null, null);
      expect(await readBack(style, { ecLevel: 'Q' }, TEXT)).toBe(TEXT);
    });
  }

  for (const gradient of ['linear', 'radial'] as Gradient[]) {
    it(`${gradient} gradient from black to dark blue`, async () => {
      const style = { ...BASE, gradient, fg: '#000000', fg2: '#1a237e', moduleShape: 'rounded' as const };
      expect(await readBack(style, {}, TEXT)).toBe(TEXT);
    });
  }
});

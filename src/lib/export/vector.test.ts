import { describe, expect, it } from 'vitest';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';
import '../../test/decode';
import { ghostscript, hasGs } from '../../test/ghostscript';
import { encodeBarcode } from '../barcode';
import { renderBarcodeSvg } from '../barcode/render';
import { DEFAULT_BARCODE_STYLE } from '../barcode/settings';
import { DEFAULT_BARCODE_OPTIONS } from '../barcode/types';
import { encode, prepareText } from '../encoder';
import { renderSvg, type RenderStyle } from '../render/svg';
import { writePdf } from './pdf';
import { parseColor, parsePath, vectorizeSvg, type Rgba, type Segment } from './vector';

const STYLE: RenderStyle = {
  quietZone: 4,
  fg: '#112233',
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

const qr = (text: string) => encode(prepareText(text).units, { type: 'model2', ecLevel: 'M', version: 'auto', mask: 'auto' }).symbols[0];

describe('parsePath', () => {
  it('resolves relative and absolute lines', () => {
    expect(parsePath('M1 2h3v1h-3zM10 0H12V2L10 2z')).toEqual([
      { op: 'M', x: 1, y: 2 },
      { op: 'L', x: 4, y: 2 },
      { op: 'L', x: 4, y: 3 },
      { op: 'L', x: 1, y: 3 },
      { op: 'Z' },
      { op: 'M', x: 10, y: 0 },
      { op: 'L', x: 12, y: 0 },
      { op: 'L', x: 12, y: 2 },
      { op: 'L', x: 10, y: 2 },
      { op: 'Z' },
    ]);
  });

  it('turns arcs into Béziers that stay on the circle', () => {
    const segs = parsePath('M0 5A5 5 0 0 1 5 0');
    const c = segs.filter((s): s is Extract<Segment, { op: 'C' }> => s.op === 'C');
    expect(c).toHaveLength(1);
    expect(c[0].x).toBeCloseTo(5);
    expect(c[0].y).toBeCloseTo(0);
    // The curve's midpoint is within 0.1% of the radius from the centre (5, 5).
    const p0 = { x: 0, y: 5 };
    const mid = {
      x: (p0.x + 3 * c[0].x1 + 3 * c[0].x2 + c[0].x) / 8,
      y: (p0.y + 3 * c[0].y1 + 3 * c[0].y2 + c[0].y) / 8,
    };
    expect(Math.hypot(mid.x - 5, mid.y - 5)).toBeCloseTo(5, 2);
  });
});

describe('parseColor', () => {
  it('reads 3, 4, 6 and 8 digit hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor('#00000080')?.a).toBeCloseTo(128 / 255);
    expect(parseColor('#f008')?.a).toBeCloseTo(136 / 255);
    expect(parseColor('red')).toBeNull();
  });
});

describe('vectorizeSvg', () => {
  it('turns a plain QR into a background and the module path, with nothing to rasterise', () => {
    const v = vectorizeSvg(renderSvg(qr('hello'), STYLE).svg);
    expect(v.shapes).toHaveLength(2);
    expect(v.shapes[0].fill).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect((v.shapes[1].fill as Rgba).r).toBeCloseTo(0x11 / 255);
    expect(v.overlay).toBeNull();
  });

  it('keeps the label text for the overlay and vectorises the rounded frame', () => {
    const v = vectorizeSvg(renderSvg(qr('hello'), { ...STYLE, label: 'SCAN <ME>' }).svg);
    expect(v.shapes[0].evenOdd).toBe(true);
    expect(v.shapes[0].segments.some((s) => s.op === 'C')).toBe(true);
    expect(v.overlay).toContain('<text');
    expect(v.overlay).toContain('SCAN &#60;ME&#62;');
    expect(v.overlay).not.toContain('<path');
  });
});

describe.skipIf(!hasGs)('vector PDF read back through Ghostscript and zxing-cpp', () => {
  it('QR code', async () => {
    const r = renderSvg(qr('https://example.com/vector'), STYLE);
    const v = vectorizeSvg(r.svg);
    const pdf = writePdf([{ widthPt: r.widthUnits * 3, heightPt: r.heightUnits * 3, vector: v }]);
    const [res] = await readBarcodesFromImageData(ghostscript(pdf, 144), { formats: ['QRCode'], tryHarder: true });
    expect(res?.text).toBe('https://example.com/vector');
  });

  it('EAN-13 (bars as vectors, digits left for the overlay)', async () => {
    const res = encodeBarcode('ean13', '4912345123459', DEFAULT_BARCODE_OPTIONS);
    if (!res.ok) throw new Error('encode failed');
    const r = renderBarcodeSvg(res.symbol, DEFAULT_BARCODE_STYLE);
    const v = vectorizeSvg(r.svg);
    expect(v.overlay).toContain('<text');
    const pdf = writePdf([{ widthPt: r.widthUnits * 2, heightPt: r.heightUnits * 2, vector: v }]);
    const [read] = await readBarcodesFromImageData(ghostscript(pdf, 216), { formats: ['EAN13'], tryHarder: true });
    expect(read?.text).toBe('4912345123459');
  });
});

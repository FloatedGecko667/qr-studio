import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBarcodesFromImageData } from 'zxing-wasm/reader';
import '../../test/decode';
import { hasGs, parsePnm } from '../../test/ghostscript';
import { encode, prepareText } from '../encoder';
import { renderSvg, type RenderStyle } from '../render/svg';
import { ascii85, psString, writeEps } from './eps';
import { vectorizeSvg } from './vector';

describe('EPS helpers', () => {
  it('encodes ASCII85 like the PostScript reference', () => {
    expect(ascii85(new TextEncoder().encode('Man '))).toBe('9jqo^~>');
    expect(ascii85(new Uint8Array([0, 0, 0, 0, 1]))).toBe('z!<~>');
  });

  it('escapes PostScript strings', () => {
    expect(psString('a(b)\\c')).toBe('(a\\(b\\)\\\\c)');
    expect(psString('日')).toBe('(\\346\\227\\245)');
  });
});

/** Renders an EPS with Ghostscript to RGB, returning a pixel reader and the image for zxing. */
function render(eps: string, dpi: number) {
  const dir = mkdtempSync(join(tmpdir(), 'qr-eps-'));
  writeFileSync(join(dir, 'in.eps'), eps);
  execFileSync('gs', ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop', '-sDEVICE=ppmraw', `-r${dpi}`, `-sOutputFile=${join(dir, 'o.ppm')}`, join(dir, 'in.eps')]);
  const { w, h, pixels: rgb } = parsePnm(readFileSync(join(dir, 'o.ppm')));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  return { w, h, px: (x: number, y: number) => [...rgb.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)], image: { data, width: w, height: h, colorSpace: 'srgb' } as ImageData };
}

describe.skipIf(!hasGs)('EPS through Ghostscript', () => {
  it('a QR code reads back', async () => {
    const sym = encode(prepareText('https://example.com/eps').units, { type: 'model2', ecLevel: 'M', version: 'auto', mask: 'auto' }).symbols[0];
    const style: RenderStyle = {
      quietZone: 4, fg: '#000000', bg: '#ffffff', transparent: false, overlayRatio: 0, logoDataUrl: null, centerText: '',
      enclosure: 'none', label: '', labelPosition: 'bottom', labelColor: '#fff', frameColor: '#000', frameRadius: 2,
      fontFamily: 'x', fontDataUrl: null, moduleShape: 'dot', finderOuter: 'rounded', gradient: 'radial', fg2: '#1a237e',
    };
    const r = renderSvg(sym, style);
    const eps = writeEps({ widthPt: r.widthUnits * 4, heightPt: r.heightUnits * 4, vector: vectorizeSvg(r.svg) });
    const [res] = await readBarcodesFromImageData(render(eps, 108).image, { formats: ['QRCode'], tryHarder: true });
    expect(res?.text).toBe('https://example.com/eps');
  });

  it('the overlay paints opaque pixels and leaves transparent ones', () => {
    // A black square below; overlay: left pixel opaque red, right pixel transparent.
    const vector = vectorizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1" fill="#000000"/></svg>');
    const overlay = { width: 2, height: 1, rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]) };
    const { px, w } = render(writeEps({ widthPt: 20, heightPt: 10, vector, overlay }), 72);
    expect(px(2, 5)).toEqual([255, 0, 0]);
    expect(px(w - 3, 5)).toEqual([0, 0, 0]);
  });
});

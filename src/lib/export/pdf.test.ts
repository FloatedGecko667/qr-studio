import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { imagesToPdf, pageSizePt, type PdfImage } from './pdf';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

function image(width: number, height: number, alpha = 255): PdfImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([i % 256, 10, 200, alpha], i * 4);
  return { width, height, rgba };
}

/** Returns the raw bytes of `id 0 obj ... stream ... endstream`. */
function streamOf(pdf: Uint8Array, id: number): Uint8Array {
  const s = latin1(pdf);
  const start = s.indexOf('stream\n', s.indexOf(`\n${id} 0 obj\n`)) + 'stream\n'.length;
  const length = Number(/\/Length (\d+)/.exec(s.slice(s.indexOf(`\n${id} 0 obj\n`), start))![1]);
  return pdf.slice(start, start + length);
}

describe('imagesToPdf', () => {
  it('has a valid header, cross-reference table and trailer', () => {
    const pdf = imagesToPdf([{ image: image(3, 2), widthPt: 30, heightPt: 20 }]);
    const s = latin1(pdf);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    // Every xref entry points at the start of its object.
    const entries = s.slice(startxref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
    expect(entries).toHaveLength(5);
    entries.forEach((line, i) => {
      const at = Number(line.slice(0, 10));
      expect(s.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('sizes the page and stores RGB pixels losslessly', () => {
    const img = image(4, 3);
    const pdf = imagesToPdf([{ image: img, widthPt: 12.5, heightPt: 9.375 }]);
    expect(latin1(pdf)).toContain('/MediaBox [0 0 12.5 9.375]');
    expect(latin1(pdf)).not.toContain('/SMask');
    const rgb = unzlibSync(streamOf(pdf, 5));
    expect(rgb).toHaveLength(4 * 3 * 3);
    expect(Array.from(rgb.slice(3, 6))).toEqual([1, 10, 200]);
  });

  it('adds a soft mask only when pixels are transparent', () => {
    const pdf = imagesToPdf([{ image: image(2, 2, 0), widthPt: 10, heightPt: 10 }]);
    expect(latin1(pdf)).toContain('/SMask 6 0 R');
    expect(Array.from(unzlibSync(streamOf(pdf, 6)))).toEqual([0, 0, 0, 0]);
  });

  it('writes one page per image', () => {
    const pdf = imagesToPdf([
      { image: image(1, 1), widthPt: 10, heightPt: 10 },
      { image: image(1, 1, 0), widthPt: 20, heightPt: 20 },
    ]);
    const s = latin1(pdf);
    expect(s).toContain('/Kids [3 0 R 6 0 R] /Count 2');
    expect(s).toContain('/MediaBox [0 0 20 20]');
  });
});

describe('pageSizePt', () => {
  it('converts pixels at a resolution to points', () => {
    expect(pageSizePt(600, 300, 600)).toEqual({ width: 72, height: 36 });
  });
});

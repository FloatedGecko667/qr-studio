import { zlibSync } from 'fflate';

export interface PdfImage {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, as returned by `getImageData`. */
  rgba: Uint8ClampedArray;
}

/** Points per inch; PDF user space units are 1/72 inch. */
const PT_PER_INCH = 72;

const encoder = new TextEncoder();

/** Page size in points for an image printed at `dpi`. */
export function pageSizePt(pxWidth: number, pxHeight: number, dpi: number): { width: number; height: number } {
  return { width: (pxWidth / dpi) * PT_PER_INCH, height: (pxHeight / dpi) * PT_PER_INCH };
}

function splitChannels(img: PdfImage): { rgb: Uint8Array; alpha: Uint8Array | null } {
  const n = img.width * img.height;
  const rgb = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  let opaque = true;
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = img.rgba[i * 4];
    rgb[i * 3 + 1] = img.rgba[i * 4 + 1];
    rgb[i * 3 + 2] = img.rgba[i * 4 + 2];
    alpha[i] = img.rgba[i * 4 + 3];
    if (alpha[i] !== 255) opaque = false;
  }
  return { rgb, alpha: opaque ? null : alpha };
}

/** Formats a number for PDF: at most 4 decimals, no exponent. */
function num(n: number): string {
  return String(Math.round(n * 10_000) / 10_000);
}

/**
 * Builds a PDF with one page per image, each page exactly the image's printed size. Images are
 * stored losslessly (Flate) with an alpha soft mask when any pixel is transparent, and drawn
 * without interpolation so module edges stay sharp.
 */
export function imagesToPdf(pages: readonly { image: PdfImage; widthPt: number; heightPt: number }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const text = (s: string) => push(encoder.encode(s));

  // Object numbers: 1 catalog, 2 page tree, then per page: page, contents, image, [mask].
  const pageIds: number[] = [];
  let next = 3;
  const layout = pages.map((p) => {
    const { rgb, alpha } = splitChannels(p.image);
    const ids = { page: next, contents: next + 1, image: next + 2, mask: alpha ? next + 3 : 0 };
    next += alpha ? 4 : 3;
    pageIds.push(ids.page);
    return { ...p, rgb, alpha, ids };
  });

  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    text(`${id} 0 obj\n${body}`);
    if (stream) {
      text('\nstream\n');
      push(stream);
      text('\nendstream');
    }
    text('\nendobj\n');
  };

  // Header with a binary comment so transfer tools treat the file as binary.
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  for (const p of layout) {
    const w = num(p.widthPt);
    const h = num(p.heightPt);
    object(
      p.ids.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${p.ids.image} 0 R >> >> /Contents ${p.ids.contents} 0 R >>`,
    );
    const content = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(p.ids.contents, `<< /Length ${content.length} >>`, content);
    const pixels = zlibSync(p.rgb, { level: 9 });
    const smask = p.alpha ? ` /SMask ${p.ids.mask} 0 R` : '';
    object(
      p.ids.image,
      `<< /Type /XObject /Subtype /Image /Width ${p.image.width} /Height ${p.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode${smask} /Length ${pixels.length} >>`,
      pixels,
    );
    if (p.alpha) {
      const mask = zlibSync(p.alpha, { level: 9 });
      object(
        p.ids.mask,
        `<< /Type /XObject /Subtype /Image /Width ${p.image.width} /Height ${p.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${mask.length} >>`,
        mask,
      );
    }
  }

  const xref = length;
  const count = next;
  text(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) text(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  text(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

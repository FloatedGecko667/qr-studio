import { zlibSync } from 'fflate';
import type { Shape } from './vector';

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

/** One page: a full-page raster image, or vector shapes with an optional raster overlay on top. */
export interface PdfPage {
  widthPt: number;
  heightPt: number;
  /** Drawn first, stretched over the whole page. */
  image?: PdfImage;
  /** Shapes in SVG user units (y down), scaled to the page. */
  vector?: { width: number; height: number; shapes: readonly Shape[] };
  /** Drawn last over the whole page (text, logos), with transparency. */
  overlay?: PdfImage;
}

/**
 * Builds a PDF with one page per image, each page exactly the image's printed size. Images are
 * stored losslessly (Flate) with an alpha soft mask when any pixel is transparent, and drawn
 * without interpolation so module edges stay sharp.
 */
export function imagesToPdf(pages: readonly { image: PdfImage; widthPt: number; heightPt: number }[]): Uint8Array {
  return writePdf(pages);
}

/** PDF path operators for shapes drawn in SVG coordinates (the caller sets up the y flip). */
export function vectorContent(shapes: readonly Shape[], alphaName: (a: number) => string): string {
  const ops: string[] = [];
  for (const sh of shapes) {
    const fill = sh.fill && sh.fill.a > 0 ? sh.fill : null;
    const stroke = sh.stroke && sh.stroke.color.a > 0 ? sh.stroke : null;
    if (!fill && !stroke) continue;
    // Each shape in its own graphics state so its colour and alpha do not leak to the next one.
    const state = ['q'];
    if (fill) state.push(`${num(fill.r)} ${num(fill.g)} ${num(fill.b)} rg`);
    if (stroke) state.push(`${num(stroke.color.r)} ${num(stroke.color.g)} ${num(stroke.color.b)} RG ${num(stroke.width)} w`);
    const alpha = Math.min(fill?.a ?? 1, stroke?.color.a ?? 1);
    if (alpha < 1) state.push(`/${alphaName(alpha)} gs`);
    ops.push(state.join(' '));
    for (const seg of sh.segments) {
      if (seg.op === 'M') ops.push(`${num(seg.x)} ${num(seg.y)} m`);
      else if (seg.op === 'L') ops.push(`${num(seg.x)} ${num(seg.y)} l`);
      else if (seg.op === 'C') ops.push(`${num(seg.x1)} ${num(seg.y1)} ${num(seg.x2)} ${num(seg.y2)} ${num(seg.x)} ${num(seg.y)} c`);
      else ops.push('h');
    }
    ops.push(fill && stroke ? (sh.evenOdd ? 'B*' : 'B') : fill ? (sh.evenOdd ? 'f*' : 'f') : 'S', 'Q');
  }
  return ops.join('\n');
}

export function writePdf(pages: readonly PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const text = (s: string) => push(encoder.encode(s));

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

  // Object numbers: 1 catalog, 2 page tree, then per page: page, contents, then its images.
  let next = 3;
  const alloc = () => next++;
  const pageIds = pages.map(() => alloc());
  const contentIds = pages.map(() => alloc());

  // Header with a binary comment so transfer tools treat the file as binary.
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

  /** Writes an image XObject (and its soft mask) and returns its object number. */
  const imageObject = (img: PdfImage): number => {
    const { rgb, alpha } = splitChannels(img);
    const id = alloc();
    const maskId = alpha ? alloc() : 0;
    const pixels = zlibSync(rgb, { level: 9 });
    const smask = alpha ? ` /SMask ${maskId} 0 R` : '';
    object(
      id,
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode${smask} /Length ${pixels.length} >>`,
      pixels,
    );
    if (alpha) {
      const mask = zlibSync(alpha, { level: 9 });
      object(
        maskId,
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${mask.length} >>`,
        mask,
      );
    }
    return id;
  };

  pages.forEach((p, i) => {
    const w = num(p.widthPt);
    const h = num(p.heightPt);
    const xobjects: string[] = [];
    const ops: string[] = [];
    if (p.image) {
      xobjects.push(`/Im0 ${imageObject(p.image)} 0 R`);
      ops.push(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    }
    const alphas = new Map<string, number>();
    if (p.vector && p.vector.width > 0 && p.vector.height > 0) {
      const sx = p.widthPt / p.vector.width;
      const sy = p.heightPt / p.vector.height;
      // SVG y grows downwards: flip once, then draw in SVG units.
      ops.push(`q ${num(sx)} 0 0 ${num(-sy)} 0 ${h} cm`);
      ops.push(
        vectorContent(p.vector.shapes, (a) => {
          const key = num(a);
          if (!alphas.has(key)) alphas.set(key, alphas.size);
          return `GA${alphas.get(key)}`;
        }),
      );
      ops.push('Q');
    }
    if (p.overlay) {
      xobjects.push(`/Im1 ${imageObject(p.overlay)} 0 R`);
      ops.push(`q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`);
    }
    const gs = [...alphas].map(([a, n]) => `/GA${n} << /Type /ExtGState /ca ${a} /CA ${a} >>`).join(' ');
    const resources = `<< ${xobjects.length ? `/XObject << ${xobjects.join(' ')} >>` : ''}${gs ? ` /ExtGState << ${gs} >>` : ''} >>`;
    object(pageIds[i], `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources ${resources} /Contents ${contentIds[i]} 0 R >>`);
    const content = zlibSync(encoder.encode(ops.join('\n')), { level: 9 });
    object(contentIds[i], `<< /Length ${content.length} /Filter /FlateDecode >>`, content);
  });

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

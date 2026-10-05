// Encapsulated PostScript (Level 3) for print shops and design tools. Same content as the vector
// PDF: shapes as paths (gradients as shadings), text and logos as an image on top. PostScript
// has no alpha channel, so the overlay uses a 1-bit mask (ImageType 3), opaque above 50% alpha.

import { zlibSync } from 'fflate';
import type { PdfImage } from './pdf';
import { isGradient, type GradientFill, type Shape } from './vector';

const num = (n: number) => String(Math.round(n * 10_000) / 10_000);

/** ASCII85 (Adobe), terminated with "~>", wrapped at 76 columns. */
export function ascii85(bytes: Uint8Array): string {
  let out = '';
  let line = 0;
  const emit = (s: string) => {
    for (const ch of s) {
      out += ch;
      if (++line === 76) {
        out += '\n';
        line = 0;
      }
    }
  };
  for (let i = 0; i < bytes.length; i += 4) {
    const n = Math.min(4, bytes.length - i);
    let v = 0;
    for (let j = 0; j < 4; j++) v = v * 256 + (j < n ? bytes[i + j] : 0);
    if (n === 4 && v === 0) {
      emit('z');
      continue;
    }
    const digits: string[] = [];
    for (let j = 0; j < 5; j++) {
      digits.unshift(String.fromCharCode((v % 85) + 33));
      v = Math.floor(v / 85);
    }
    emit(digits.slice(0, n + 1).join(''));
  }
  return `${out}~>`;
}

/** PostScript string literal: backslash, parentheses and non-ASCII escaped. */
export function psString(s: string): string {
  return `(${Array.from(new TextEncoder().encode(s), (b) =>
    b === 0x5c || b === 0x28 || b === 0x29 ? `\\${String.fromCharCode(b)}` : b < 0x20 || b > 0x7e ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b),
  ).join('')})`;
}

function shading(g: GradientFill): string {
  const c = (x: { r: number; g: number; b: number }) => `[${num(x.r)} ${num(x.g)} ${num(x.b)}]`;
  const fn = `<< /FunctionType 2 /Domain [0 1] /C0 ${c(g.from)} /C1 ${c(g.to)} /N 1 >>`;
  const coords = g.type === 'linear' ? `/ShadingType 2 /Coords [${num(g.x1)} ${num(g.y1)} ${num(g.x2)} ${num(g.y2)}]` : `/ShadingType 3 /Coords [${num(g.cx)} ${num(g.cy)} 0 ${num(g.cx)} ${num(g.cy)} ${num(g.r)}]`;
  return `<< ${coords} /ColorSpace /DeviceRGB /Function ${fn} /Extend [true true] >>`;
}

function shapesPs(shapes: readonly Shape[]): string[] {
  const ops: string[] = [];
  for (const sh of shapes) {
    const path = ['newpath'];
    for (const s of sh.segments) {
      if (s.op === 'M') path.push(`${num(s.x)} ${num(s.y)} moveto`);
      else if (s.op === 'L') path.push(`${num(s.x)} ${num(s.y)} lineto`);
      else if (s.op === 'C') path.push(`${num(s.x1)} ${num(s.y1)} ${num(s.x2)} ${num(s.y2)} ${num(s.x)} ${num(s.y)} curveto`);
      else path.push('closepath');
    }
    if (isGradient(sh.fill)) {
      ops.push('gsave', ...path, sh.evenOdd ? 'eoclip' : 'clip', `${shading(sh.fill)} shfill`, 'grestore');
      continue;
    }
    // No transparency in PostScript: translucent colours are drawn opaque.
    if (sh.fill && sh.fill.a > 0) ops.push(...path, `${num(sh.fill.r)} ${num(sh.fill.g)} ${num(sh.fill.b)} setrgbcolor`, sh.evenOdd ? 'eofill' : 'fill');
    if (sh.stroke && sh.stroke.color.a > 0) {
      const c = sh.stroke.color;
      ops.push(...path, `${num(c.r)} ${num(c.g)} ${num(c.b)} setrgbcolor ${num(sh.stroke.width)} setlinewidth stroke`);
    }
  }
  return ops;
}

/** Overlay as ImageType 3 / InterleaveType 1: per pixel one mask byte then R, G, B. */
function overlayPs(img: PdfImage, widthPt: number, heightPt: number): string[] {
  const n = img.width * img.height;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    // Mask byte: 255 = paint (only its high bit counts), 0 = leave what is below.
    data[i * 4] = img.rgba[i * 4 + 3] >= 128 ? 255 : 0;
    data[i * 4 + 1] = img.rgba[i * 4];
    data[i * 4 + 2] = img.rgba[i * 4 + 1];
    data[i * 4 + 3] = img.rgba[i * 4 + 2];
  }
  const [w, h] = [img.width, img.height];
  return [
    'gsave',
    `${num(widthPt)} ${num(heightPt)} scale`,
    '/DeviceRGB setcolorspace',
    '<< /ImageType 3 /InterleaveType 1',
    `/DataDict << /ImageType 1 /Width ${w} /Height ${h} /BitsPerComponent 8 /Decode [0 1 0 1 0 1] /ImageMatrix [${w} 0 0 -${h} 0 ${h}]`,
    '/DataSource currentfile /ASCII85Decode filter /FlateDecode filter >>',
    `/MaskDict << /ImageType 1 /Width ${w} /Height ${h} /BitsPerComponent 8 /Decode [1 0] /ImageMatrix [${w} 0 0 -${h} 0 ${h}] >>`,
    '>> image',
    ascii85(zlibSync(data, { level: 9 })),
    'grestore',
  ];
}

export interface EpsPage {
  widthPt: number;
  heightPt: number;
  vector: { width: number; height: number; shapes: readonly Shape[] };
  overlay?: PdfImage;
  title?: string;
}

export function writeEps(p: EpsPage): string {
  const sx = p.widthPt / p.vector.width;
  const sy = p.heightPt / p.vector.height;
  const lines = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%BoundingBox: 0 0 ${Math.ceil(p.widthPt)} ${Math.ceil(p.heightPt)}`,
    `%%HiResBoundingBox: 0 0 ${num(p.widthPt)} ${num(p.heightPt)}`,
    '%%LanguageLevel: 3',
    '%%Creator: QR Studio',
    `%%Title: ${psString(p.title ?? 'QR Studio')}`,
    '%%Pages: 1',
    '%%EndComments',
    'save',
    'gsave',
    // SVG y grows downwards: flip once, then draw in SVG units.
    `[${num(sx)} 0 0 ${num(-sy)} 0 ${num(p.heightPt)}] concat`,
    ...shapesPs(p.vector.shapes),
    'grestore',
    ...(p.overlay ? overlayPs(p.overlay, p.widthPt, p.heightPt) : []),
    'restore',
    'showpage',
    '%%EOF',
    '',
  ];
  return lines.join('\n');
}

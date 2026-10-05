import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Renders page 1 of a PDF with Ghostscript to 8-bit grey, as RGBA ImageData. */
export function ghostscript(pdf: Uint8Array, dpi: number): ImageData {
  const dir = mkdtempSync(join(tmpdir(), 'qr-pdf-'));
  writeFileSync(join(dir, 'in.pdf'), pdf);
  execFileSync('gs', ['-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pgmraw', `-r${dpi}`, `-sOutputFile=${join(dir, 'out.pgm')}`, join(dir, 'in.pdf')]);
  const pgm = readFileSync(join(dir, 'out.pgm'));
  const { w, h, pixels: grey } = parsePnm(pgm);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([grey[i], grey[i], grey[i], 255], i * 4);
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

export let hasGs = false;
try {
  execFileSync('gs', ['--version']);
  hasGs = true;
} catch {
  hasGs = false;
}

/** Width, height and pixel bytes of a binary PNM (P5/P6) as Ghostscript writes it (with comments). */
export function parsePnm(buf: Buffer): { w: number; h: number; pixels: Buffer } {
  const fields: string[] = [];
  let at = 0;
  const space = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;
  while (fields.length < 4) {
    while (space(buf[at])) at++;
    if (buf[at] === 0x23) {
      while (buf[at] !== 0x0a) at++;
      continue;
    }
    const start = at;
    while (!space(buf[at])) at++;
    fields.push(buf.subarray(start, at).toString('latin1'));
  }
  return { w: Number(fields[1]), h: Number(fields[2]), pixels: buf.subarray(at + 1) };
}

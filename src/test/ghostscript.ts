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
  // Header: "P5", width, height, maxval, separated by whitespace; "#" starts a comment line.
  const fields: string[] = [];
  let at = 0;
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(pgm[at]))) at++;
    if (pgm[at] === 0x23) {
      while (pgm[at] !== 0x0a) at++;
      continue;
    }
    const start = at;
    while (!/\s/.test(String.fromCharCode(pgm[at]))) at++;
    fields.push(pgm.subarray(start, at).toString('latin1'));
  }
  const [w, h] = [Number(fields[1]), Number(fields[2])];
  const grey = pgm.subarray(at + 1);
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


// Regenerates src/lib/encoder/specTables.ts from zxing-cpp's QRVersion.cpp.
// Usage: curl -sLO https://raw.githubusercontent.com/zxing-cpp/zxing-cpp/master/core/src/qrcode/QRVersion.cpp && node scripts/gen-spec-tables.mjs

import fs from 'node:fs';
const src = fs.readFileSync('QRVersion.cpp', 'utf8');
function section(name) {
  const start = src.indexOf(`Version::${name}(int number)`);
  return src.slice(start, src.indexOf('if (number <', start));
}
function parse(text) {
  const out = [];
  const re = /\{\s*(\d+)\s*,\s*\{([^}]*)\}\s*,\s*\{([^}]*)\}\s*\}/g;
  let m;
  const clean = (s) => s.replace(/\/\/[^\n]*/g, '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  while ((m = re.exec(text))) {
    const nums = clean(m[3]);
    out.push({ align: clean(m[2]), ecb: [0, 1, 2, 3].map((i) => nums.slice(i * 5, i * 5 + 5)) });
  }
  return out;
}
const m2 = parse(section('Model2'));
const rm = parse(section('rMQR'));
const names = [...section('rMQR').matchAll(/\/\/ (R\d+x\d+)/g)].map((x) => x[1]);
const fmt = (a) => JSON.stringify(a).replace(/,/g, ', ');
let ts = `// Generated from ISO/IEC 18004:2015 Table 9 and ISO/IEC 23941:2022 Table 8,
// transcribed via zxing-cpp core/src/qrcode/QRVersion.cpp (Apache-2.0) and
// cross-checked against rmqrcode-python. Do not edit by hand.

/** [ecCodewordsPerBlock, blocks1, dataCodewords1, blocks2, dataCodewords2] */
export type EcBlocks = readonly [number, number, number, number, number];

/** Index: version - 1. Inner order: L, M, Q, H. */
export const MODEL2_EC: readonly (readonly [EcBlocks, EcBlocks, EcBlocks, EcBlocks])[] = [
${m2.map((v) => `  ${fmt(v.ecb)},`).join('\n')}
];

/** Alignment pattern centre coordinates. Index: version - 1. */
export const MODEL2_ALIGN: readonly (readonly number[])[] = [
${m2.map((v) => `  ${fmt(v.align)},`).join('\n')}
];

export interface RmqrSpec {
  readonly name: string;
  readonly height: number;
  readonly width: number;
  /** Vertical timing / alignment pattern centre columns. */
  readonly align: readonly number[];
  readonly M: EcBlocks;
  readonly H: EcBlocks;
}

/** Index: version indicator (0-31). */
export const RMQR_SPECS: readonly RmqrSpec[] = [
${rm.map((v, i) => { const [, h, w] = names[i].match(/R(\d+)x(\d+)/); return `  { name: '${names[i]}', height: ${h}, width: ${w}, align: ${fmt(v.align)}, M: ${fmt(v.ecb[1])}, H: ${fmt(v.ecb[3])} },`; }).join('\n')}
];
`;
fs.writeFileSync('src/lib/encoder/specTables.ts', ts);
fs.rmSync('QRVersion.cpp');

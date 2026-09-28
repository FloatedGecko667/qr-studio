import { describe, expect, it } from 'vitest';
import { encode, prepareText, type EcLevel, type SymbolType } from '.';
import cases from './__fixtures__/reference.json';

// Golden matrices produced by independent encoders (segno for Model 2 / Micro QR,
// rmqrcode-python for rMQR) with identical version, EC level and mask.
interface RefCase {
  type: SymbolType;
  data: string;
  version: number | string;
  ecLevel: EcLevel;
  mask: number;
  mode: string;
  rows: string[];
}

describe('matches reference encoders module-for-module', () => {
  for (const c of cases as RefCase[]) {
    const version = typeof c.version === 'string' ? Number(c.version.slice(1)) : c.version;
    it(`${c.type} v${c.version} ${c.ecLevel} mask ${c.mask} ${c.mode}`, () => {
      const { units } = prepareText(c.data, 'sjis');
      const sym = encode(units, { type: c.type, ecLevel: c.ecLevel, version, mask: c.mask }).symbols[0];
      const rows: string[] = [];
      for (let y = 0; y < sym.height; y++) rows.push(Array.from(sym.modules.subarray(y * sym.width, (y + 1) * sym.width)).join(''));
      expect(rows).toEqual(c.rows);
    });
  }
});

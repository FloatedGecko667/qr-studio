// Code 93 with Full ASCII shift characters and the two mandatory check characters (C, K).
import { FULL_ASCII } from './code39';
import { BarcodeError, digitsOf } from './types';

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
/** Values 43-46 are the shift characters ($) (%) (/) (+). */
const SHIFTS: Record<string, number> = { $: 43, '%': 44, '/': 45, '+': 46 };
const PATTERNS = [
  '131112', '111213', '111312', '111411', '121113', '121212', '121311', '111114', '131211', '141111',
  '211113', '211212', '211311', '221112', '221211', '231111', '112113', '112212', '112311', '122112',
  '132111', '111123', '111222', '111321', '121122', '131121', '212112', '212211', '211122', '211221',
  '221121', '222111', '112122', '112221', '122121', '123111', '121131', '311112', '311211', '321111',
  '112131', '113121', '211131', '121221', '312111', '311121', '122211',
];
const START_STOP = '111141';

function values(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c > 127) throw new BarcodeError('barcode.error.charAt', { char: ch });
    const direct = CHARS.indexOf(ch);
    if (direct >= 0) {
      out.push(direct);
      continue;
    }
    const pair = FULL_ASCII[c];
    out.push(SHIFTS[pair[0]], CHARS.indexOf(pair[1]));
  }
  return out;
}

function check(vals: readonly number[], maxWeight: number): number {
  let sum = 0;
  for (let i = 0; i < vals.length; i++) sum += vals[vals.length - 1 - i] * ((i % maxWeight) + 1);
  return sum % 47;
}

export function code93(text: string): number[] {
  if (text.length === 0) throw new BarcodeError('barcode.error.empty');
  const vals = values(text);
  vals.push(check(vals, 20));
  vals.push(check(vals, 15));
  return [...digitsOf(START_STOP), ...vals.flatMap((v) => digitsOf(PATTERNS[v])), ...digitsOf(START_STOP), 1];
}

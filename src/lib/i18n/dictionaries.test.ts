import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it as itDict } from './it';
import { ja } from './ja';
import { pt } from './pt';
import { zhHans } from './zh-Hans';
import { zhHant } from './zh-Hant';

const DICTS: Record<string, Record<string, string>> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, fr, de, es, pt, it: itDict };
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  for (const [name, dict] of Object.entries(DICTS)) {
    it(`${name} has exactly the Japanese keys, non-empty, with the same placeholders`, () => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(ja).sort());
      for (const [key, value] of Object.entries(ja)) {
        expect(dict[key].trim(), key).not.toBe('');
        expect(placeholders(dict[key]), key).toEqual(placeholders(value));
      }
    });
  }
});

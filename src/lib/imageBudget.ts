import { capacityRow } from './encoder/capacity';
import { specsBySize, symbolSpec } from './encoder';
import { dataUrlPrefix, type ImageEncoding } from './imageData';
import { MAX_APPEND } from './pipeline';
import type { SymbolSettings } from './settings';

/**
 * Largest image file (bytes) that fits the current symbol settings with `encoding`:
 * the fixed version or the largest one for 'auto', times the structured-append count
 * ('auto' → 16 on Model 2). Returns 0 when the symbol cannot hold that encoding.
 */
export function imageByteBudget(symbol: SymbolSettings, encoding: ImageEncoding, mime: string): number {
  const spec =
    symbol.version === 'auto' ? specsBySize(symbol.type, symbol.ecLevel).at(-1)! : symbolSpec(symbol.type, symbol.version, symbol.ecLevel);
  const count = symbol.structuredAppend === 'auto' ? (symbol.type === 'model2' ? MAX_APPEND : 1) : symbol.structuredAppend;
  const row = capacityRow(spec, { structuredAppend: count });
  // Splitting across symbols rounds per part; keep one byte of slack per symbol.
  const slack = count > 1 ? count : 0;
  let budget: number;
  if (encoding === 'binary') budget = (row.byte ?? 0) - slack;
  else if (encoding === 'base64') budget = Math.floor(((row.byte ?? 0) - slack - dataUrlPrefix(mime).length) / 4) * 3;
  else {
    const chars = (row.alnum ?? 0) - slack * 2;
    budget = Math.floor(chars / 3) * 2 + (chars % 3 === 2 ? 1 : 0);
  }
  return Math.max(0, budget);
}

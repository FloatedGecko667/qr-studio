import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodesFromImageData, type ReadResult } from 'zxing-wasm/reader';
import type { EncodedSymbol } from '../lib/encoder';

const require = createRequire(import.meta.url);
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')).buffer as ArrayBuffer },
});

/** Rasterizes a symbol (with quiet zone) and decodes it with zxing-cpp. */
export async function decodeSymbol(sym: EncodedSymbol, scale = 4, quiet = 4): Promise<ReadResult[]> {
  const w = (sym.width + quiet * 2) * scale;
  const h = (sym.height + quiet * 2) * scale;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < sym.height; y++) {
    for (let x = 0; x < sym.width; x++) {
      if (!sym.modules[y * sym.width + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * w + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return readBarcodesFromImageData({ data, width: w, height: h, colorSpace: 'srgb' } as ImageData, {
    formats: ['QRCode', 'MicroQRCode', 'rMQRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
}

import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export interface VerifyResult {
  ok: boolean;
  /** Decoded payload; compared with the expected value by the caller. */
  text: string;
  bytes: Uint8Array;
  format: string;
}

let prepared = false;

/** Decodes an image with zxing-cpp (loaded on first use, served locally for offline use). */
export async function verifyImage(image: ImageData): Promise<VerifyResult | null> {
  const zxing = await import('zxing-wasm/reader');
  if (!prepared) {
    zxing.prepareZXingModule({ overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path) } });
    prepared = true;
  }
  const results = await zxing.readBarcodes(image, {
    formats: ['QRCode', 'MicroQRCode', 'rMQRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  const r = results.find((x) => x.isValid);
  if (!r) return null;
  return { ok: true, text: r.text, bytes: r.bytes, format: r.format };
}

export function canvasImageData(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

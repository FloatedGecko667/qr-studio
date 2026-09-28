import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { ReadInputBarcodeFormat, ReadResult } from 'zxing-wasm/reader';

export interface VerifyResult {
  ok: boolean;
  /** Decoded payload; compared with the expected value by the caller. */
  text: string;
  bytes: Uint8Array;
  format: string;
}

let prepared = false;

export const QR_FORMATS: ReadInputBarcodeFormat[] = ['QRCode', 'MicroQRCode', 'rMQRCode'];
export const LINEAR_FORMATS: ReadInputBarcodeFormat[] = ['AllLinear'];
export const SCAN_FORMATS: ReadInputBarcodeFormat[] = [...QR_FORMATS, ...LINEAR_FORMATS];

/** Decodes symbols with zxing-cpp (loaded on first use, served locally). */
export async function readSymbols(
  image: ImageData,
  maxSymbols = 1,
  tryHarder = true,
  formats: ReadInputBarcodeFormat[] = QR_FORMATS,
): Promise<ReadResult[]> {
  const zxing = await import('zxing-wasm/reader');
  if (!prepared) {
    zxing.prepareZXingModule({ overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path) } });
    prepared = true;
  }
  const results = await zxing.readBarcodes(image, {
    formats,
    tryHarder,
    maxNumberOfSymbols: maxSymbols,
  });
  return results.filter((r) => r.isValid);
}

export async function verifyImage(image: ImageData, formats = QR_FORMATS): Promise<VerifyResult | null> {
  const [r] = await readSymbols(image, 1, true, formats);
  if (!r) return null;
  return { ok: true, text: r.text, bytes: r.bytes, format: r.format };
}

export function canvasImageData(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

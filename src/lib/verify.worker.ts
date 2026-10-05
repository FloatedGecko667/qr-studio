/// <reference lib="webworker" />
// Decodes rendered symbols off the main thread so automatic checks never stall typing.
import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader';
import { readSymbols } from './verify';

export interface VerifyRequest {
  id: number;
  image: ImageData;
  formats: ReadInputBarcodeFormat[];
}

export interface VerifyResponse {
  id: number;
  results: { text: string; bytes: Uint8Array; format: string }[];
  error?: boolean;
}

self.onmessage = async (e: MessageEvent<VerifyRequest>) => {
  const { id, image, formats } = e.data;
  try {
    const read = await readSymbols(image, 1, true, formats);
    self.postMessage({ id, results: read.map((r) => ({ text: r.text, bytes: r.bytes, format: r.format })) } satisfies VerifyResponse);
  } catch {
    self.postMessage({ id, results: [], error: true } satisfies VerifyResponse);
  }
};

import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader';
import type { VerifyRequest, VerifyResponse } from './verify.worker';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: VerifyResponse) => void>();

/** Decodes `image` in a shared worker (started on first use). Rejects if the worker fails. */
export function decodeInWorker(image: ImageData, formats: ReadInputBarcodeFormat[]): Promise<VerifyResponse> {
  if (!worker) {
    worker = new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<VerifyResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      for (const resolve of pending.values()) resolve({ id: -1, results: [], error: true });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ id, image, formats } satisfies VerifyRequest, [image.data.buffer]);
  });
}

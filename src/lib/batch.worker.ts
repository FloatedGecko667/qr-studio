/// <reference lib="webworker" />
// Encodes batch items off the main thread and returns ready-to-rasterize SVG.
import { EncodeError } from './encoder';
import { buildOptimized, type OptimizeSettings } from './optimize';
import { runPipeline } from './pipeline';
import { composeSheet } from './render/output';
import { renderSvg, type RenderStyle } from './render/svg';
import type { SymbolSettings } from './settings';
import type { BatchItem } from './batch';

export type BatchRequest =
  | { type: 'start'; items: BatchItem[]; symbol: SymbolSettings; style: RenderStyle; optimize: OptimizeSettings } | { type: 'cancel' };

export type BatchResponse =
  | { type: 'item'; index: number; filename: string; svg: string; widthUnits: number; heightUnits: number }
  | { type: 'error'; index: number; row: number; reason: string }
  | { type: 'done' };

let cancelled = false;

self.onmessage = async (e: MessageEvent<BatchRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  cancelled = false;
  for (const [index, item] of msg.items.entries()) {
    if (cancelled) break;
    const post = (r: BatchResponse) => self.postMessage(r);
    try {
      const result = runPipeline(buildOptimized('text', { text: item.content }, msg.optimize), msg.symbol);
      if (result.status !== 'ok') {
        const reason =
          result.status === 'invalid' ? result.errors[0] : result.status === 'unsupported' ? `symbol.unsupported.${result.feature}` : result.status === 'charset' ? 'status.charset' : 'batch.tooLong';
        post({ type: 'error', index, row: item.row, reason });
        continue;
      }
      const svgs = result.result.symbols.map((s) => renderSvg(s, msg.style));
      const r = svgs.length === 1 ? svgs[0] : composeSheet(svgs);
      post({ type: 'item', index, filename: item.filename, svg: r.svg, widthUnits: r.widthUnits, heightUnits: r.heightUnits });
    } catch (err) {
      post({ type: 'error', index, row: item.row, reason: err instanceof EncodeError ? 'batch.tooLong' : 'verify.error' });
    }
    // Yield so a cancel message can be processed between items.
    if (index % 20 === 19) await new Promise((r) => setTimeout(r, 0));
  }
  self.postMessage({ type: 'done' } satisfies BatchResponse);
};

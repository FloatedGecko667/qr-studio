<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { BATCH_LIMIT, decodeCsv, itemsFromCsv, itemsFromLines, type BatchItem } from '../lib/batch';
  import type { BatchRequest, BatchResponse } from '../lib/batch.worker';
  import { exportBlob, extensionFor, pdfSource, renderStyle, svgsToPdf, type PdfSource } from '../lib/compose';
  import { outputSize } from '../lib/render/output';
  import { downloadBlob, zipFiles } from '../lib/export/download';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { fontDataUrl } from '../lib/render/font';

  let mode: 'lines' | 'csv' = $state('lines');
  let input = $state('');
  let running = $state(false);
  let done = $state(0);
  let total = $state(0);
  let result = $state('');
  let failures: string[] = $state([]);
  let worker: Worker | null = null;

  const parsed = $derived(mode === 'lines' ? itemsFromLines(input) : itemsFromCsv(input));
  const items: BatchItem[] = $derived(Array.isArray(parsed) ? parsed : []);

  async function loadCsv(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    input = decodeCsv(new Uint8Array(await file.arrayBuffer()));
    mode = 'csv';
  }

  /** With PDF output: one file with a page per row instead of a ZIP. */
  let onePdf = $state(true);

  function cancel() {
    worker?.postMessage({ type: 'cancel' } satisfies BatchRequest);
    worker?.terminate();
    worker = null;
    running = false;
    result = t('batch.cancelled');
  }

  async function generate() {
    if (items.length === 0 || items.length > BATCH_LIMIT) return;
    running = true;
    done = 0;
    total = items.length;
    result = '';
    failures = [];
    const style = app.settings.style;
    const needsFont = style.label.trim() !== '' || (style.overlay === 'text' && style.centerText !== '');
    const font = needsFont && (app.settings.output.format !== 'svg' || style.embedFont) ? await fontDataUrl() : null;
    const output = $state.snapshot(app.settings.output);
    const files: { name: string; blob: Blob }[] = [];
    const pdfPages: PdfSource[] = [];
    const merge = onePdf && output.format === 'pdf';
    const w = new Worker(new URL('../lib/batch.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    // Rasterize sequentially on the main thread (canvas) while the worker keeps encoding.
    let chain = Promise.resolve();
    w.onmessage = (e: MessageEvent<BatchResponse>) => {
      const msg = e.data;
      chain = chain.then(async () => {
        if (worker !== w) return;
        if (msg.type === 'item') {
          try {
            if (merge) {
              pdfPages.push(pdfSource(msg.svg, outputSize(msg, output), output.unit === 'mm' ? output.dpi : undefined));
            } else {
              const blob = await exportBlob(msg, output, style.bg);
              files.push({ name: `${msg.filename}.${extensionFor(output)}`, blob });
            }
          } catch {
            failures.push(t('batch.failedRow', { row: items[msg.index].row, reason: t('output.tooLarge') }));
          }
          done++;
        } else if (msg.type === 'error') {
          failures.push(t('batch.failedRow', { row: msg.row, reason: t(msg.reason) }));
          done++;
        } else {
          w.terminate();
          worker = null;
          if (files.length) downloadBlob(await zipFiles(files), `qr-batch-${files.length}.zip`);
          if (pdfPages.length) downloadBlob(await svgsToPdf(pdfPages), `qr-batch-${pdfPages.length}.pdf`);
          result = t('batch.done', { ok: files.length + pdfPages.length, failed: failures.length });
          running = false;
        }
      });
    };
    w.postMessage({
      type: 'start',
      items: $state.snapshot(items),
      symbol: $state.snapshot(app.settings.symbol),
      optimize: $state.snapshot(app.settings.optimize),
      style: renderStyle($state.snapshot(style), app.logoDataUrl, font),
    } satisfies BatchRequest);
  }

  onDestroy(() => worker?.terminate());
</script>

<section class="card stack" aria-labelledby="batch-heading">
  <h2 id="batch-heading">{t('batch.title')}</h2>
  <p class="muted">{t('batch.hint', { max: formatNumber(BATCH_LIMIT) })}</p>

  <div class="row">
    <div class="segmented" role="group" aria-label={t('batch.mode')}>
      <button type="button" aria-pressed={mode === 'lines'} onclick={() => (mode = 'lines')}>{t('batch.modeLines')}</button>
      <button type="button" aria-pressed={mode === 'csv'} onclick={() => (mode = 'csv')}>{t('batch.modeCsv')}</button>
    </div>
    <label class="btn small">
      {t('batch.loadCsv')}
      <input type="file" accept=".csv,text/csv" class="sr-only" onchange={loadCsv} />
    </label>
  </div>

  <label class="field">
    <span>{t('batch.input')}</span>
    <textarea rows="10" spellcheck="false" bind:value={input} placeholder={mode === 'csv' ? 'content,filename\nhttps://example.com,example' : 'https://example.com/1\nhttps://example.com/2'}></textarea>
  </label>

  {#if parsed === 'missing-content'}
    <p class="msg error">{t('batch.csvMissing')}</p>
  {:else}
    <p class="muted">{t('batch.count', { count: formatNumber(items.length) })}</p>
    {#if items.length > BATCH_LIMIT}<p class="msg error">{t('batch.tooMany', { max: formatNumber(BATCH_LIMIT) })}</p>{/if}
  {/if}

  {#if app.settings.output.format === 'pdf'}
    <label class="check">
      <input type="checkbox" bind:checked={onePdf} />
      {t('batch.onePdf')}
    </label>
  {/if}

  <div class="row">
    <button type="button" class="btn primary" disabled={running || items.length === 0 || items.length > BATCH_LIMIT} onclick={generate}>
      {t(onePdf && app.settings.output.format === 'pdf' ? 'batch.generatePdf' : 'batch.generate')}
    </button>
    {#if running}
      <button type="button" class="btn" onclick={cancel}>{t('batch.cancel')}</button>
      <progress max={total} value={done} aria-label={t('batch.progress', { done, total })}></progress>
      <span class="muted">{t('batch.progress', { done, total })}</span>
    {/if}
  </div>
  <div role="status" aria-live="polite">
    {#if result}<p class="msg ok">{result}</p>{/if}
  </div>
  {#if failures.length}
    <ul class="failures">
      {#each failures.slice(0, 50) as f, i (i)}<li>{f}</li>{/each}
    </ul>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  progress {
    flex: 1;
    min-width: 120px;
  }
  .failures {
    margin: 0;
    padding-left: 18px;
    color: var(--error);
    font-size: 12px;
  }
</style>

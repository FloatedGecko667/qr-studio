<script lang="ts">
  import { BARCODE_LABELS, encodeBarcode, SAMPLE_VALUES } from '../lib/barcode';
  import { renderBarcodeSvg } from '../lib/barcode/render';
  import { barcodeSize } from '../lib/barcode/settings';
  import { barcode } from '../lib/barcode/state.svelte';
  import { BATCH_LIMIT, decodeCsv, itemsFromCsv, itemsFromLines, serialLines, type BatchItem, type SerialSpec } from '../lib/batch';
  import { exportSized, extensionFor } from '../lib/compose';
  import { downloadBlob, zipFiles } from '../lib/export/download';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { fontDataUrl } from '../lib/render/font';

  let mode: 'lines' | 'csv' = $state('lines');
  let input = $state('');
  let running = $state(false);
  let cancelled = false;
  let done = $state(0);
  let total = $state(0);
  let result = $state('');
  let failures: string[] = $state([]);
  let serial: SerialSpec = $state({ prefix: '', suffix: '', start: 1, step: 1, count: 10, digits: 4 });

  const parsed = $derived(mode === 'lines' ? itemsFromLines(input, 'barcode') : itemsFromCsv(input, 'barcode'));
  const items: BatchItem[] = $derived(Array.isArray(parsed) ? parsed : []);
  const sample = $derived(SAMPLE_VALUES[barcode.settings.type]);

  async function loadCsv(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    input = decodeCsv(new Uint8Array(await file.arrayBuffer()));
    mode = 'csv';
  }

  function fillSerial() {
    mode = 'lines';
    input = serialLines($state.snapshot(serial)).join('\n');
  }

  async function generate() {
    if (items.length === 0 || items.length > BATCH_LIMIT) return;
    running = true;
    cancelled = false;
    done = 0;
    total = items.length;
    result = '';
    failures = [];
    const { type, options, style, output } = $state.snapshot(barcode.settings);
    const font = style.showText && style.font === 'jetbrains' ? await fontDataUrl() : null;
    const files: { name: string; blob: Blob }[] = [];
    for (const [i, item] of items.entries()) {
      if (cancelled) break;
      const r = encodeBarcode(type, item.content, options);
      if (!r.ok) {
        failures.push(t('batch.failedRow', { row: item.row, reason: t(r.error, r.params) }));
      } else {
        try {
          const svg = renderBarcodeSvg(r.symbol, style, font);
          const blob = await exportSized(svg.svg, barcodeSize(svg, output), output.format, output.unit === 'mm' ? output.dpi : undefined, output.quality, style.bg);
          files.push({ name: `${item.filename}.${extensionFor(output)}`, blob });
        } catch (e) {
          failures.push(t('batch.failedRow', { row: item.row, reason: t(e instanceof RangeError ? 'output.tooLarge' : 'verify.error') }));
        }
      }
      done++;
      // Let the progress bar and the cancel button respond.
      if (i % 10 === 9) await new Promise((res) => setTimeout(res, 0));
    }
    if (cancelled) {
      result = t('batch.cancelled');
    } else {
      if (files.length) downloadBlob(await zipFiles(files), `barcode-batch-${files.length}.zip`);
      result = t('batch.done', { ok: files.length, failed: failures.length });
    }
    running = false;
  }
</script>

<section class="card stack" aria-labelledby="barcode-batch-heading">
  <h2 id="barcode-batch-heading">{t('barcode.batch.title')}</h2>
  <p class="muted">{t('barcode.batch.hint', { max: formatNumber(BATCH_LIMIT) })}</p>
  <p class="current">{t('barcode.batch.current', { type: BARCODE_LABELS[barcode.settings.type] })}</p>

  <details class="serial">
    <summary>{t('barcode.batch.serial')}</summary>
    <div class="stack inner">
      <div class="grid3">
        <label class="field">
          <span>{t('barcode.batch.prefix')}</span>
          <input type="text" maxlength="40" autocomplete="off" bind:value={serial.prefix} />
        </label>
        <label class="field">
          <span>{t('barcode.batch.start')}</span>
          <input type="number" step="1" bind:value={serial.start} />
        </label>
        <label class="field">
          <span>{t('barcode.batch.step')}</span>
          <input type="number" step="1" bind:value={serial.step} />
        </label>
        <label class="field">
          <span>{t('barcode.batch.count')}</span>
          <input type="number" min="1" max={BATCH_LIMIT} step="1" bind:value={serial.count} />
        </label>
        <label class="field">
          <span>{t('barcode.batch.digits')}</span>
          <input type="number" min="0" max="20" step="1" bind:value={serial.digits} />
        </label>
        <label class="field">
          <span>{t('barcode.batch.suffix')}</span>
          <input type="text" maxlength="40" autocomplete="off" bind:value={serial.suffix} />
        </label>
      </div>
      <div class="row">
        <button type="button" class="btn small" onclick={fillSerial}>{t('barcode.batch.fill')}</button>
        <span class="muted">{serialLines({ ...serial, count: 1 })[0] ?? ''} …</span>
      </div>
    </div>
  </details>

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
    <textarea rows="10" spellcheck="false" bind:value={input} placeholder={mode === 'csv' ? `content,filename\n${sample},item-1` : sample}></textarea>
  </label>

  {#if parsed === 'missing-content'}
    <p class="msg error">{t('batch.csvMissing')}</p>
  {:else}
    <p class="muted">{t('batch.count', { count: formatNumber(items.length) })}</p>
    {#if items.length > BATCH_LIMIT}<p class="msg error">{t('batch.tooMany', { max: formatNumber(BATCH_LIMIT) })}</p>{/if}
  {/if}

  <div class="row">
    <button type="button" class="btn primary" disabled={running || items.length === 0 || items.length > BATCH_LIMIT} onclick={generate}>
      {t('batch.generate')}
    </button>
    {#if running}
      <button type="button" class="btn" onclick={() => (cancelled = true)}>{t('batch.cancel')}</button>
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
  .current {
    font-size: 13px;
    font-weight: 600;
  }
  .serial {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
  }
  .serial summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }
  .inner {
    margin-top: 10px;
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
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

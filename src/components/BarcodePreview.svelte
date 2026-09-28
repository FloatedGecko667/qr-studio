<script lang="ts">
  import { BARCODE_LABELS, HAS_ADDON } from '../lib/barcode';
  import { renderBarcodeSvg } from '../lib/barcode/render';
  import { BARCODE_LIMITS, barcodeSize, moduleSize, type BarcodeOutput } from '../lib/barcode/settings';
  import type { BarcodeState } from '../lib/barcode/state.svelte';
  import { exportSized, extensionFor } from '../lib/compose';
  import { copyImage, copyText, downloadBlob, sanitizeFilename } from '../lib/export/download';
  import { addHistory, newId } from '../lib/storage/records';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { fontDataUrl } from '../lib/render/font';
  import { MAX_CANVAS_PIXELS, canvasToBlob, svgToCanvas } from '../lib/render/raster';

  let { code }: { code: BarcodeState } = $props();

  const out = $derived(code.settings.output);
  const style = $derived(code.settings.style);
  const type = $derived(code.settings.type);
  const res = $derived(code.result);
  const svg = $derived(res.ok ? renderBarcodeSvg(res.symbol, style) : null);
  const kind = $derived(res.ok ? res.symbol.kind : 'linear');
  const mod = $derived(moduleSize(out, kind));
  const size = $derived(svg ? barcodeSize(svg, out, kind) : null);
  const tooLarge = $derived(!!size && out.format !== 'svg' && size.pxWidth * size.pxHeight > MAX_CANVAS_PIXELS);
  const readable = $derived(res.ok && res.symbol.expected.length > 0);
  const RETAIL_X = [0.264, 0.66];

  let notice = $state('');
  let noticeKind: 'ok' | 'error' = $state('ok');
  let verify: { state: 'idle' | 'running' | 'ok' | 'mismatch' | 'fail' | 'error'; format?: string; key?: string } = $state({ state: 'idle' });
  const verifyKey = $derived(svg?.svg ?? '');

  function flash(msg: string, kind: typeof noticeKind = 'ok') {
    notice = msg;
    noticeKind = kind;
    setTimeout(() => {
      if (notice === msg) notice = '';
    }, 2500);
  }

  /** Output SVG with the font embedded so it renders the same everywhere. */
  async function exportSvg() {
    if (!res.ok) return null;
    const font = style.showText && style.font === 'jetbrains' ? await fontDataUrl() : null;
    return renderBarcodeSvg(res.symbol, style, font);
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      flash(e instanceof RangeError ? t('output.tooLarge') : t('verify.error'), 'error');
    }
  }

  const baseName = () => sanitizeFilename(`${type}-${code.value}`, 'barcode');

  const download = () =>
    run(async () => {
      const r = await exportSvg();
      if (!r) return;
      const s = barcodeSize(r, out, kind);
      const blob = await exportSized(r.svg, s, out.format, out.unit === 'mm' ? out.dpi : undefined, out.quality, style.bg);
      downloadBlob(blob, `${baseName()}.${extensionFor(out)}`);
    });

  const copy = () =>
    run(async () => {
      const r = await exportSvg();
      if (!r) return;
      const s = barcodeSize(r, out, kind);
      try {
        await copyImage(await canvasToBlob(await svgToCanvas(r.svg, s.pxWidth, s.pxHeight), 'png'));
        flash(t('output.copied'));
      } catch {
        flash(t('output.copyFailed'), 'error');
      }
    });

  const copyData = () =>
    run(async () => {
      if (!res.ok) return;
      try {
        await copyText(res.symbol.expected[0] ?? res.symbol.hrt);
        flash(t('output.copied'));
      } catch {
        flash(t('output.copyFailed'), 'error');
      }
    });

  const saveHistory = () =>
    run(async () => {
      if (!res.ok) return;
      await addHistory({
        id: newId(),
        createdAt: Date.now(),
        kind: kind === 'matrix' ? 'datamatrix' : 'barcode',
        fields: { type, value: code.value, label: BARCODE_LABELS[type] },
        symbol: { ...code.settings.options },
        style: { ...style },
        logoDataUrl: null,
        summary: code.value.slice(0, 120),
      });
      flash(t('output.saved'));
    });

  const runVerify = () =>
    run(async () => {
      if (!res.ok) return;
      const key = verifyKey;
      const expected = res.symbol.expected;
      verify = { state: 'running', key };
      try {
        const { verifyImage, canvasImageData, BARCODE_FORMATS } = await import('../lib/verify');
        const r = await exportSvg();
        if (!r) throw new Error('invalid');
        const scale = Math.max(2, Math.ceil(800 / r.widthUnits));
        const canvas = await svgToCanvas(r.svg, Math.round(r.widthUnits * scale), Math.round(r.heightUnits * scale), '#ffffff');
        const v = await verifyImage(canvasImageData(canvas), BARCODE_FORMATS);
        verify = !v ? { state: 'fail', key } : { state: expected.includes(v.text) ? 'ok' : 'mismatch', format: v.format, key };
      } catch {
        verify = { state: 'error', key };
      }
    });

  function setOut<K extends keyof BarcodeOutput>(key: K, value: BarcodeOutput[K]) {
    code.updateOutput({ [key]: value } as Partial<BarcodeOutput>);
  }

  const mm = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
</script>

<section class="card stack preview" aria-labelledby="barcode-preview-heading">
  <h2 id="barcode-preview-heading">{t('section.preview')}</h2>

  <div class="canvas" aria-live="polite">
    {#if svg}
      <!-- SVG is generated by renderBarcodeSvg: all text is XML-escaped and colours are validated. -->
      <div class="symbol" class:matrix={kind === 'matrix'} role="img" aria-label={`${BARCODE_LABELS[type]}: ${res.ok ? res.symbol.hrt : ''}`}>{@html svg.svg}</div>
    {:else}
      <div class="placeholder" aria-hidden="true">|||||</div>
    {/if}
  </div>

  {#if res.ok}
    <p class="status">
      {#if res.symbol.kind === 'matrix'}
        {t('barcode.statusMatrix', {
          type: BARCODE_LABELS[type],
          size: res.symbol.sizeLabel.replace('x', ' × '),
          used: res.symbol.usedCodewords,
          total: res.symbol.dataCodewords,
          count: res.symbol.dataLength,
        })}
      {:else}
        {t('barcode.status', { type: BARCODE_LABELS[type], modules: formatNumber(Math.round(res.symbol.width * 10) / 10), count: res.symbol.dataLength })}
      {/if}
    </p>
  {/if}

  <div class="stack output">
    <h3>{t('section.output')}</h3>
    <div class="grid2">
      <div class="field">
        <span class="label" id="bc-unit-label">{t('output.unit')}</span>
        <div class="segmented" role="group" aria-labelledby="bc-unit-label">
          <button type="button" aria-pressed={out.unit === 'px'} onclick={() => setOut('unit', 'px')}>px</button>
          <button type="button" aria-pressed={out.unit === 'mm'} onclick={() => setOut('unit', 'mm')}>mm</button>
        </div>
      </div>
      <label class="field">
        <span>{t('output.format')}</span>
        <select value={out.format} onchange={(e) => setOut('format', e.currentTarget.value as BarcodeOutput['format'])}>
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
          <option value="pdf">PDF</option>
        </select>
      </label>
      {#if out.unit === 'px'}
        <label class="field">
          <span>{t(kind === 'matrix' ? 'barcode.output.matrixModulePx' : 'barcode.output.modulePx')}</span>
          <input
            type="number"
            min={BARCODE_LIMITS.modulePx[0]}
            max={kind === 'matrix' ? BARCODE_LIMITS.matrixModulePx[1] : BARCODE_LIMITS.modulePx[1]}
            value={mod.px}
            onchange={(e) => setOut(kind === 'matrix' ? 'matrixModulePx' : 'modulePx', Number(e.currentTarget.value))} />
        </label>
      {:else}
        <label class="field">
          <span>{t(kind === 'matrix' ? 'barcode.output.matrixModuleMm' : 'barcode.output.moduleMm')}</span>
          <input
            type="number"
            min={BARCODE_LIMITS.moduleMm[0]}
            max={BARCODE_LIMITS.moduleMm[1]}
            step="0.001"
            value={mod.mm}
            onchange={(e) => setOut(kind === 'matrix' ? 'matrixModuleMm' : 'moduleMm', Number(e.currentTarget.value))} />
        </label>
        <label class="field">
          <span>{t('output.dpi')}</span>
          <input
            type="number"
            min={BARCODE_LIMITS.dpi[0]}
            max={BARCODE_LIMITS.dpi[1]}
            value={out.dpi}
            onchange={(e) => setOut('dpi', Number(e.currentTarget.value))} />
        </label>
      {/if}
      {#if out.format === 'jpeg' || out.format === 'webp'}
        <label class="field">
          <span>{t('output.quality')}: {Math.round(out.quality * 100)}</span>
          <input type="range" min="0.5" max="1" step="0.01" value={out.quality} oninput={(e) => setOut('quality', Number(e.currentTarget.value))} />
        </label>
      {/if}
    </div>

    {#if out.format === 'pdf'}<p class="muted">{t(out.unit === 'mm' ? 'output.pdfNote' : 'output.pdfNotePx')}</p>{/if}
    {#if size && svg}
      <p class="muted">
        {t('output.size', { w: formatNumber(size.pxWidth), h: formatNumber(size.pxHeight) })}
        {#if out.unit === 'mm'}· {t('barcode.output.physical', { w: mm(svg.widthUnits * mod.mm), h: mm(svg.heightUnits * mod.mm) })}{/if}
      </p>
      {#if size.rasterModuleMm !== null && out.format !== 'svg'}
        <p class="muted">{t('barcode.output.dots', { dots: size.dotsPerModule, mm: size.rasterModuleMm.toFixed(3) })}</p>
        {#if Math.abs(size.rasterModuleMm - mod.mm) > 0.0005}
          <p class="msg warn">{t('barcode.output.dotsAdjusted', { mm: size.rasterModuleMm.toFixed(3) })}</p>
        {/if}
      {/if}
      {#if out.unit === 'mm' && HAS_ADDON.has(type) && (mod.mm < RETAIL_X[0] || mod.mm > RETAIL_X[1])}
        <p class="msg warn">{t('barcode.output.retailRange')}</p>
      {/if}
      {#if tooLarge}<p class="msg error">{t('output.tooLarge')}</p>{/if}
    {/if}

    <div class="row">
      <button type="button" class="btn primary" disabled={!svg || tooLarge} onclick={download}>{t('output.download')}</button>
      <button type="button" class="btn" disabled={!svg || tooLarge} onclick={copy}>{t('output.copy')}</button>
      <button type="button" class="btn" disabled={!svg} onclick={copyData}>{t('output.copyText')}</button>
      <button type="button" class="btn" disabled={!svg} onclick={saveHistory}>{t('output.saveHistory')}</button>
    </div>
    {#if notice}<p class="msg {noticeKind}" role="status">{notice}</p>{/if}
  </div>

  <div class="stack">
    <div class="row">
      <h3>{t('verify.title')}</h3>
      <button type="button" class="btn small" disabled={!svg || !readable || verify.state === 'running'} onclick={runVerify}>
        {verify.state === 'running' ? t('verify.running') : t('verify.run')}
      </button>
    </div>
    <div role="status" aria-live="polite">
      {#if svg && !readable}
        <p class="muted">{t('barcode.verify.unsupported')}</p>
      {:else if verify.state !== 'idle' && verify.state !== 'running' && verify.key !== verifyKey}
        <p class="muted">{t('verify.stale')}</p>
      {:else if verify.state === 'ok'}
        <p class="msg ok">{t('verify.ok', { format: verify.format ?? '' })}</p>
      {:else if verify.state === 'mismatch'}
        <p class="msg warn">{t('verify.mismatch')}</p>
      {:else if verify.state === 'fail'}
        <p class="msg error">{t('barcode.verify.fail')}</p>
      {:else if verify.state === 'error'}
        <p class="msg error">{t('verify.error')}</p>
      {/if}
    </div>
  </div>
</section>

<style>
  p {
    margin: 0;
  }
  .canvas {
    display: grid;
    place-items: center;
    background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 16px 16px;
    border-radius: 8px;
    padding: 16px;
    min-height: 180px;
  }
  .symbol {
    width: 100%;
    max-width: 480px;
    line-height: 0;
  }
  .symbol.matrix {
    max-width: 280px;
  }
  .symbol :global(svg) {
    width: 100%;
    height: auto;
    max-height: 360px;
  }
  /* Two-column layout: shrink the symbol on short screens so the whole card stays in view. */
  @media (min-width: 861px) {
    .symbol.matrix {
      max-width: min(280px, max(140px, calc(100dvh - var(--ribbon-h, 0px) - 560px)));
    }
    .symbol :global(svg) {
      max-height: min(360px, max(120px, calc(100dvh - var(--ribbon-h, 0px) - 560px)));
    }
  }
  .placeholder {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: 2px;
    color: var(--border);
  }
  .status {
    font-size: 13px;
    color: var(--text-2);
    word-break: break-word;
  }
  .output {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
</style>

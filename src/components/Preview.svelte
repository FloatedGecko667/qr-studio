<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { exportBlob, extensionFor, renderStyle, symbolSvgs } from '../lib/compose';
  import { copyImage, copyText, downloadBlob, zipFiles } from '../lib/export/download';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { fontDataUrl } from '../lib/render/font';
  import { composeSheet, outputSize } from '../lib/render/output';
  import { MAX_CANVAS_PIXELS, canvasToBlob, svgToCanvas } from '../lib/render/raster';
  import { renderSvg, type SvgResult } from '../lib/render/svg';
  import { LIMITS, type OutputSettings } from '../lib/settings';
  import { addHistory, newId } from '../lib/storage/records';
  import { versionLabel } from '../lib/encoder';
  import type { Suggestion } from '../lib/pipeline';
  import { decompressText } from '../lib/optimize';

  const out = $derived(app.settings.output);
  const style = $derived(app.settings.style);
  const pipe = $derived(app.pipeline);
  const svgs: SvgResult[] = $derived(
    pipe.status === 'ok' ? symbolSvgs(pipe.result.symbols, renderStyle(style, app.logoDataUrl, null)) : [],
  );
  const size = $derived(svgs.length ? outputSize(svgs[0], out) : null);
  const tooLarge = $derived(!!size && out.format !== 'svg' && size.pxWidth * size.pxHeight > MAX_CANVAS_PIXELS);

  let notice = $state('');
  let noticeKind: 'ok' | 'warn' | 'error' = $state('ok');
  let verify: { state: 'idle' | 'running' | 'ok' | 'mismatch' | 'fail' | 'error'; format?: string; key?: string } = $state({
    state: 'idle',
  });
  const verifyKey = $derived(svgs.map((s) => s.svg).join('|'));

  function flash(msg: string, kind: typeof noticeKind = 'ok') {
    notice = msg;
    noticeKind = kind;
    setTimeout(() => {
      if (notice === msg) notice = '';
    }, 2500);
  }

  function confirmDangerous(): boolean {
    return !app.payload.warnings.includes('payload.url.dangerous') || confirm(t('payload.dangerousConfirm'));
  }

  const needsFont = $derived(style.label.trim() !== '' || (style.overlay === 'text' && style.centerText !== ''));

  /** Re-renders with the font embedded when the output cannot use document fonts. */
  async function exportSvgs(forRaster: boolean): Promise<SvgResult[]> {
    if (pipe.status !== 'ok') return [];
    const embed = needsFont && (forRaster || style.embedFont);
    const font = embed ? await fontDataUrl() : null;
    return pipe.result.symbols.map((s) => renderSvg(s, renderStyle(style, app.logoDataUrl, font)));
  }

  function baseName(): string {
    return pipe.status === 'ok' ? `qr-${pipe.result.symbols[0].spec.label}` : 'qr';
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      flash(e instanceof RangeError ? t('output.tooLarge') : t('verify.error'), 'error');
    }
  }

  const download = () =>
    run(async () => {
      if (!confirmDangerous()) return;
      const [first] = await exportSvgs(out.format !== 'svg');
      if (!first) return;
      downloadBlob(await exportBlob(first, out, style.bg), `${baseName()}.${extensionFor(out)}`);
    });

  const downloadAll = () =>
    run(async () => {
      if (!confirmDangerous()) return;
      const list = await exportSvgs(out.format !== 'svg');
      const files = [];
      for (const [i, r] of list.entries()) {
        files.push({ name: `${baseName()}-${i + 1}of${list.length}.${extensionFor(out)}`, blob: await exportBlob(r, out, style.bg) });
      }
      downloadBlob(await zipFiles(files), `${baseName()}-x${list.length}.zip`);
    });

  const downloadSheet = () =>
    run(async () => {
      if (!confirmDangerous()) return;
      const sheet = composeSheet(await exportSvgs(out.format !== 'svg'));
      downloadBlob(await exportBlob(sheet, out, style.bg), `${baseName()}-sheet.${extensionFor(out)}`);
    });

  const copy = () =>
    run(async () => {
      const [first] = await exportSvgs(true);
      if (!first) return;
      const s = outputSize(first, { ...out, format: 'png' });
      try {
        await copyImage(await canvasToBlob(await svgToCanvas(first.svg, s.pxWidth, s.pxHeight), 'png'));
        flash(t('output.copied'));
      } catch {
        flash(t('output.copyFailed'), 'error');
      }
    });

  const copyData = () =>
    run(async () => {
      if (!app.payload.text) return;
      try {
        await copyText(app.payload.text);
        flash(t('output.copied'));
      } catch {
        flash(t('output.copyFailed'), 'error');
      }
    });

  const saveHistory = () =>
    run(async () => {
      if (!confirmDangerous()) return;
      const text = app.payload.text;
      const summary = text !== undefined ? text.slice(0, 120) : `${t('kind.binary')} ${app.payload.bytes?.length ?? 0} B`;
      await addHistory({
        id: newId(),
        createdAt: Date.now(),
        kind: app.kind,
        fields: $state.snapshot(app.fields[app.kind]) as Record<string, unknown>,
        symbol: { ...app.settings.symbol },
        style: { ...style },
        logoDataUrl: app.logoDataUrl,
        summary,
      });
      flash(t('output.saved'));
    });

  const runVerify = () =>
    run(async () => {
      if (pipe.status !== 'ok') return;
      const key = verifyKey;
      verify = { state: 'running', key };
      const { verifyImage, canvasImageData } = await import('../lib/verify');
      const [first] = await exportSvgs(true);
      const scale = Math.max(2, Math.ceil(600 / first.widthUnits));
      const canvas = await svgToCanvas(first.svg, first.widthUnits * scale, first.heightUnits * scale, '#ffffff');
      try {
        const r = await verifyImage(canvasImageData(canvas));
        if (!r) verify = { state: 'fail', key };
        else verify = { state: matches(r.text, r.bytes) ? 'ok' : 'mismatch', format: r.format, key };
      } catch {
        verify = { state: 'error', key };
      }
    });

  function matches(text: string, bytes: Uint8Array): boolean {
    if (pipe.status !== 'ok') return false;
    // Structured append and GS1 decode to parts / formatted strings; a successful decode is enough.
    if (pipe.result.symbols.length > 1 || pipe.opts.fnc1) return true;
    if (pipe.compression) return decompressText(bytes) === app.payload.text;
    const p = app.payload;
    if (p.bytes) return bytes.length === p.bytes.length && bytes.every((b, i) => b === p.bytes![i]);
    return text === p.text;
  }

  function applySuggestion(s: Suggestion) {
    if (s.type === 'version') app.updateSymbol({ version: s.version });
    else if (s.type === 'ecLevel') app.updateSymbol({ ecLevel: s.ecLevel, version: 'auto' });
    else if (s.type === 'structuredAppend') app.updateSymbol({ structuredAppend: s.count, version: 'auto' });
    else app.updateSymbol({ type: 'model2', version: 'auto' });
  }

  function suggestionText(s: Suggestion): string {
    if (s.type === 'version') return t('suggest.version', { version: versionLabel(app.settings.symbol.type, s.version) });
    if (s.type === 'ecLevel') return t('suggest.ecLevel', { ecLevel: s.ecLevel });
    if (s.type === 'structuredAppend') return t('suggest.structuredAppend', { count: s.count });
    return t('suggest.model2');
  }

  function setOut<K extends keyof OutputSettings>(key: K, value: OutputSettings[K]) {
    app.updateOutput({ [key]: value } as Partial<OutputSettings>);
  }
</script>

<section class="card stack preview" aria-labelledby="preview-heading">
  <h2 id="preview-heading">{t('section.preview')}</h2>

  <div class="canvas" class:multi={svgs.length > 1} aria-live="polite">
    {#if svgs.length}
      {#each svgs as s, i (i)}
        <!-- SVG is generated by renderSvg: all text is XML-escaped and colours are validated. -->
        <div class="symbol" role="img" aria-label={`QR ${i + 1}/${svgs.length}`}>{@html s.svg}</div>
      {/each}
    {:else}
      <div class="placeholder" aria-hidden="true">QR</div>
    {/if}
  </div>

  {#if pipe.status === 'ok'}
    {@const sym = pipe.result.symbols[0]}
    <p class="status">
      {#if pipe.result.symbols.length > 1}
        {t('status.okAppend', {
          label: sym.spec.label,
          count: pipe.result.symbols.length,
          parity: (pipe.result.parity ?? 0).toString(16).padStart(2, '0').toUpperCase(),
        })}
      {:else}
        {t('status.ok', {
          label: sym.spec.label,
          mask: sym.mask,
          used: formatNumber(sym.usedBits),
          total: formatNumber(sym.spec.dataBits),
          percent: Math.round((sym.usedBits / sym.spec.dataBits) * 100),
        })}
      {/if}
    </p>
  {:else if pipe.status === 'too-long'}
    <div class="msg error stack" role="alert">
      <span>{t('status.tooLong', { need: formatNumber(pipe.requiredBits), max: formatNumber(pipe.availableBits) })}</span>
      {#if pipe.suggestions.length}
        <div class="row">
          <span>{t('status.suggest')}:</span>
          {#each pipe.suggestions as s (s.type)}
            <button type="button" class="btn small" onclick={() => applySuggestion(s)}>{suggestionText(s)}</button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if pipe.status === 'charset'}
    <p class="msg error" role="alert">{t('status.charset')}</p>
  {:else if pipe.status === 'unsupported'}
    <p class="msg error" role="alert">{t(`symbol.unsupported.${pipe.feature}`)}</p>
  {/if}

  <div class="stack output">
    <h3>{t('section.output')}</h3>
    <div class="grid2">
      <div class="field">
        <span class="label" id="unit-label">{t('output.unit')}</span>
        <div class="segmented" role="group" aria-labelledby="unit-label">
          <button type="button" aria-pressed={out.unit === 'px'} onclick={() => setOut('unit', 'px')}>px</button>
          <button type="button" aria-pressed={out.unit === 'mm'} onclick={() => setOut('unit', 'mm')}>mm</button>
        </div>
      </div>
      <label class="field">
        <span>{t('output.format')}</span>
        <select value={out.format} onchange={(e) => setOut('format', e.currentTarget.value as OutputSettings['format'])}>
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
      {#if out.unit === 'px'}
        <label class="field">
          <span>{t('output.modulePx')}</span>
          <input type="number" min={LIMITS.modulePx[0]} max={LIMITS.modulePx[1]} value={out.modulePx} onchange={(e) => setOut('modulePx', Number(e.currentTarget.value))} />
        </label>
      {:else}
        <label class="field">
          <span>{t('output.sizeMm')}</span>
          <input type="number" min={LIMITS.sizeMm[0]} max={LIMITS.sizeMm[1]} step="0.1" value={out.sizeMm} onchange={(e) => setOut('sizeMm', Number(e.currentTarget.value))} />
        </label>
        <label class="field">
          <span>{t('output.dpi')}</span>
          <input type="number" min={LIMITS.dpi[0]} max={LIMITS.dpi[1]} step="1" value={out.dpi} onchange={(e) => setOut('dpi', Number(e.currentTarget.value))} />
        </label>
      {/if}
      {#if out.format === 'jpeg' || out.format === 'webp'}
        <label class="field">
          <span>{t('output.quality')}: {Math.round(out.quality * 100)}</span>
          <input type="range" min="0.5" max="1" step="0.01" value={out.quality} oninput={(e) => setOut('quality', Number(e.currentTarget.value))} />
        </label>
      {/if}
      {#if out.format === 'svg' && needsFont}
        <label class="check">
          <input type="checkbox" checked={style.embedFont} onchange={(e) => app.updateStyle({ embedFont: e.currentTarget.checked })} />
          {t('style.embedFont')}
        </label>
      {/if}
    </div>
    {#if size}
      <p class="muted">
        {t('output.size', { w: formatNumber(size.pxWidth), h: formatNumber(size.pxHeight) })}
        {#if size.moduleMm !== null}· {t('output.moduleMm', { mm: size.moduleMm.toFixed(2) })}{/if}
      </p>
      {#if size.moduleMm !== null && size.moduleMm < LIMITS.minModuleMm}
        <p class="msg warn">{t('output.moduleTooSmall', { min: LIMITS.minModuleMm })}</p>
      {/if}
      {#if tooLarge}<p class="msg error">{t('output.tooLarge')}</p>{/if}
    {/if}

    <div class="row">
      <button type="button" class="btn primary" disabled={!svgs.length || tooLarge} onclick={download}>{t('output.download')}</button>
      {#if svgs.length > 1}
        <button type="button" class="btn" disabled={tooLarge} onclick={downloadAll}>{t('output.downloadAll')}</button>
        <button type="button" class="btn" onclick={downloadSheet}>{t('output.downloadSheet')}</button>
      {/if}
      <button type="button" class="btn" disabled={!svgs.length} onclick={copy}>{t('output.copy')}</button>
      <button type="button" class="btn" disabled={!svgs.length || !app.payload.text} onclick={copyData}>{t('output.copyText')}</button>
      <button type="button" class="btn" disabled={!svgs.length} onclick={saveHistory}>{t('output.saveHistory')}</button>
    </div>
    {#if notice}<p class="msg {noticeKind}" role="status">{notice}</p>{/if}
  </div>

  <div class="stack">
    <div class="row">
      <h3>{t('verify.title')}</h3>
      <button type="button" class="btn small" disabled={!svgs.length || verify.state === 'running'} onclick={runVerify}>
        {verify.state === 'running' ? t('verify.running') : t('verify.run')}
      </button>
    </div>
    <div role="status" aria-live="polite">
      {#if verify.state !== 'idle' && verify.state !== 'running' && verify.key !== verifyKey}
        <p class="muted">{t('verify.stale')}</p>
      {:else if verify.state === 'ok'}
        <p class="msg ok">{t('verify.ok', { format: verify.format ?? '' })}</p>
      {:else if verify.state === 'mismatch'}
        <p class="msg warn">{t('verify.mismatch')}</p>
      {:else if verify.state === 'fail'}
        <p class="msg error">{t('verify.fail')}</p>
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
    min-height: 220px;
  }
  .canvas.multi {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }
  .symbol {
    width: 100%;
    max-width: 320px;
    line-height: 0;
  }
  /* Two-column layout: shrink the symbol on short screens so the whole card stays in view. */
  @media (min-width: 861px) {
    .symbol {
      max-width: min(320px, max(160px, calc(100dvh - var(--ribbon-h, 0px) - 540px)));
    }
  }
  .symbol :global(svg) {
    width: 100%;
    height: auto;
  }
  .placeholder {
    font-size: 48px;
    font-weight: 700;
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

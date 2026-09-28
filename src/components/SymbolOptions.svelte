<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { ecLevelsFor, versionLabel, versionsFor, type EcLevel, type SymbolType } from '../lib/encoder';
  import { t } from '../lib/i18n/index.svelte';
  import { MASK_COUNT } from '../lib/normalize';
  import type { OptimizeSettings } from '../lib/optimize';

  const OPTIMIZE_KEYS: (keyof OptimizeSettings)[] = ['uppercaseUrl', 'halfwidth', 'compactContact', 'deflate'];

  const s = $derived(app.settings.symbol);
  const types: SymbolType[] = ['model2', 'micro', 'rmqr'];
  const levels = $derived(ecLevelsFor(s.type, s.version === 'auto' ? undefined : s.version));
  const versions = $derived(versionsFor(s.type));
  const resolved = $derived(app.pipeline.status === 'ok' ? app.pipeline.result.symbols[0].spec : null);

  const warnings = $derived.by(() => {
    const w: string[] = [];
    if (s.type === 'micro') w.push('symbol.readerWarningMicro');
    if (s.type === 'rmqr') w.push('symbol.readerWarningRmqr');
    if (s.type === 'model2' && resolved && resolved.version >= 25) w.push('symbol.readerWarningLarge');
    if (app.appendCount > 1) w.push('symbol.readerWarningAppend');
    return w;
  });
</script>

<section class="card stack" aria-labelledby="symbol-heading">
  <h2 id="symbol-heading">{t('section.symbol')}</h2>

  <div class="field">
    <span class="label" id="type-label">{t('symbol.type')}</span>
    <div class="segmented" role="group" aria-labelledby="type-label">
      {#each types as type (type)}
        <button type="button" aria-pressed={s.type === type} onclick={() => app.updateSymbol({ type })}>{t(`symbol.${type}`)}</button>
      {/each}
    </div>
  </div>

  <div class="grid2">
    <label class="field">
      <span>{t('symbol.version')}</span>
      <select
        value={String(s.version)}
        onchange={(e) => app.updateSymbol({ version: e.currentTarget.value === 'auto' ? 'auto' : Number(e.currentTarget.value) })}>
        <option value="auto">{t('symbol.auto')}{resolved && s.version === 'auto' ? ` (${versionLabel(s.type, resolved.version)})` : ''}</option>
        {#each versions as v (v)}
          <option value={String(v)}>{versionLabel(s.type, v)}</option>
        {/each}
      </select>
    </label>

    <div class="field">
      <span class="label" id="ec-label">{t('symbol.ecLevel')}</span>
      <div class="segmented" role="group" aria-labelledby="ec-label">
        {#each levels as l (l)}
          <button type="button" aria-pressed={s.ecLevel === l} onclick={() => app.updateSymbol({ ecLevel: l as EcLevel })}>{l}</button>
        {/each}
      </div>
    </div>

    <label class="field">
      <span>{t('symbol.mask')}</span>
      {#if MASK_COUNT[s.type] === 0}
        <span class="muted">{t('symbol.maskFixed')}</span>
      {:else}
        <select
          value={String(s.mask)}
          onchange={(e) => app.updateSymbol({ mask: e.currentTarget.value === 'auto' ? 'auto' : Number(e.currentTarget.value) })}>
          <option value="auto">{t('symbol.auto')}</option>
          {#each Array.from({ length: MASK_COUNT[s.type] }, (_, i) => i) as m (m)}
            <option value={String(m)}>{m}</option>
          {/each}
        </select>
      {/if}
    </label>

    <label class="field">
      <span>{t('symbol.charset')}</span>
      <select value={s.charset} onchange={(e) => app.updateSymbol({ charset: e.currentTarget.value as typeof s.charset })}>
        <option value="auto">{t('symbol.charsetAuto')}</option>
        <option value="sjis">Shift_JIS</option>
        <option value="utf8">UTF-8</option>
      </select>
    </label>

    {#if s.type === 'model2'}
      <label class="field">
        <span>{t('symbol.structuredAppend')}</span>
        <select
          value={String(s.structuredAppend)}
          onchange={(e) =>
            app.updateSymbol({ structuredAppend: e.currentTarget.value === 'auto' ? 'auto' : Number(e.currentTarget.value) })}>
          <option value="auto">{t('symbol.auto')}{s.structuredAppend === 'auto' ? ` (${app.appendCount > 1 ? app.appendCount : t('symbol.structuredAppendOff')})` : ''}</option>
          <option value="1">{t('symbol.structuredAppendOff')}</option>
          {#each Array.from({ length: 15 }, (_, i) => i + 2) as n (n)}
            <option value={String(n)}>{n}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <p class="muted">{s.type === 'micro' && s.version === 1 ? t('symbol.m1Hint') : t('symbol.ecLevelHint')}</p>

  {#if s.type !== 'micro'}
    <label class="check">
      <input type="checkbox" checked={s.eci} onchange={(e) => app.updateSymbol({ eci: e.currentTarget.checked })} />
      {t('symbol.eci')}
    </label>
    {#if s.eci}<p class="muted">{t('symbol.eciHint')}</p>{/if}
  {/if}

  <fieldset class="stack optimize">
    <legend>{t('optimize.title')}</legend>
    {#each OPTIMIZE_KEYS as key (key)}
      <label class="check">
        <input type="checkbox" checked={app.settings.optimize[key]} onchange={(e) => app.updateOptimize({ [key]: e.currentTarget.checked })} />
        <span>{t(`optimize.${key}`)}</span>
      </label>
      {#if app.settings.optimize[key]}<p class="muted note">{t(`optimize.${key}Hint`)}</p>{/if}
    {/each}
  </fieldset>

  {#each warnings as w (w)}
    <p class="msg warn">{t(w)}</p>
  {/each}
</section>

<style>
  p {
    margin: 0;
  }
  .optimize {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 12px;
    gap: 6px;
  }
  legend {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    padding: 0 4px;
  }
  .note {
    margin-left: 22px;
  }
</style>

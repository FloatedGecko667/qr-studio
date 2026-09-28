<script lang="ts">
  import {
    BARCODE_GROUPS,
    BARCODE_LABELS,
    HAS_ADDON,
    HAS_RATIO,
    IS_MATRIX,
    maxValueLength,
    SAMPLE_VALUES,
    type BarcodeType,
    type CodabarGuard,
    type DmShape,
    type MsiCheck,
  } from '../lib/barcode';
  import { DM_SIZES, dmSizeLabel } from '../lib/barcode/datamatrix';
  import type { BarcodeState } from '../lib/barcode/state.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';

  let { code }: { code: BarcodeState } = $props();

  const type = $derived(code.settings.type);
  const o = $derived(code.settings.options);
  const res = $derived(code.result);
  const GUARDS: CodabarGuard[] = ['A', 'B', 'C', 'D'];
  const MSI: MsiCheck[] = ['none', 'mod10', 'mod11', 'mod1010', 'mod1110'];
  // Whole-module ratios keep wide bars on the pixel grid.
  const RATIOS = [2, 3];
  const SHAPES: DmShape[] = ['square', 'rect', 'auto'];
  const matrix = $derived(IS_MATRIX.has(type));
  const groups = $derived(BARCODE_GROUPS.map((g) => ({ ...g, types: g.types.filter((x) => code.types.includes(x)) })).filter((g) => g.types.length));
  const dmSizes = $derived(DM_SIZES.filter((s) => o.dmShape === 'auto' || (o.dmShape === 'square') === (s.rows === s.cols)));
  const numeric = ['ean13', 'ean8', 'upca', 'upce', 'itf', 'itf14', 'msi', 'pharmacode', 'code128c'];
</script>

<section class="card stack" aria-labelledby="barcode-content-heading">
  <h2 id="barcode-content-heading">{t('section.content')}</h2>

  <label class="field">
    <span>{t(matrix ? 'barcode.typeMatrix' : 'barcode.type')}</span>
    <select value={type} onchange={(e) => code.setType(e.currentTarget.value as BarcodeType)}>
      {#each groups as g (g.id)}
        <optgroup label={t(`barcode.group.${g.id}`)}>
          {#each g.types as id (id)}
            <option value={id}>{BARCODE_LABELS[id]}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </label>

  <label class="field">
    <span>{t('barcode.value')}</span>
    {#if matrix}
      <textarea rows="4" spellcheck="false" autocomplete="off" autocapitalize="off" maxlength={maxValueLength(type)} bind:value={code.value}></textarea>
    {:else}
      <input
        type="text"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        maxlength={maxValueLength(type)}
        inputmode={numeric.includes(type) ? 'numeric' : 'text'}
        bind:value={code.value} />
    {/if}
  </label>
  <div class="row between">
    <p class="muted grow">{t(`barcode.hint.${type}`)}</p>
    <span class="muted">{t('barcode.length', { count: formatNumber(Array.from(code.value).length) })}</span>
  </div>
  {#if code.value !== SAMPLE_VALUES[type]}
    <button type="button" class="btn small start" onclick={() => (code.value = SAMPLE_VALUES[type])}>{t('barcode.sample')}</button>
  {/if}

  {#if matrix}
    <div class="grid2">
      <div class="field">
        <span class="label" id="dm-shape-label">{t('barcode.opt.dmShape')}</span>
        <div class="segmented" role="group" aria-labelledby="dm-shape-label">
          {#each SHAPES as shape (shape)}
            <button type="button" aria-pressed={o.dmShape === shape} onclick={() => code.updateOptions({ dmShape: shape, dmSize: 'auto' })}>
              {t(`barcode.dm.${shape}`)}
            </button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span>{t('barcode.opt.dmSize')}</span>
        <select value={o.dmSize} onchange={(e) => code.updateOptions({ dmSize: e.currentTarget.value })}>
          <option value="auto">{t('barcode.dm.sizeAuto')}</option>
          {#each dmSizes as s (dmSizeLabel(s))}
            <option value={dmSizeLabel(s)}>{s.rows} × {s.cols}（{t('barcode.dm.capacity', { n: s.dataCw })}）</option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
  {#if type === 'code39' || type === 'itf'}
    <label class="check">
      <input type="checkbox" checked={o.checkDigit} onchange={(e) => code.updateOptions({ checkDigit: e.currentTarget.checked })} />
      {t('barcode.opt.checkDigit')} ({type === 'code39' ? 'mod 43' : 'mod 10'})
    </label>
  {/if}
  {#if type === 'code39'}
    <label class="check">
      <input type="checkbox" checked={o.fullAscii} onchange={(e) => code.updateOptions({ fullAscii: e.currentTarget.checked })} />
      {t('barcode.opt.fullAscii')}
    </label>
  {/if}
  {#if HAS_RATIO.has(type)}
    <div class="field">
      <span class="label" id="ratio-label">{t('barcode.opt.wideRatio')}</span>
      <div class="segmented" role="group" aria-labelledby="ratio-label">
        {#each RATIOS as ratio (ratio)}
          <button type="button" aria-pressed={o.wideRatio === ratio} onclick={() => code.updateOptions({ wideRatio: ratio })}>1 : {ratio}</button>
        {/each}
      </div>
    </div>
  {/if}
  {#if type === 'msi'}
    <label class="field">
      <span>{t('barcode.opt.msiCheck')}</span>
      <select value={o.msiCheck} onchange={(e) => code.updateOptions({ msiCheck: e.currentTarget.value as MsiCheck })}>
        {#each MSI as m (m)}
          <option value={m}>{m === 'none' ? t('barcode.opt.none') : m.replace('mod', 'Mod ')}</option>
        {/each}
      </select>
    </label>
  {/if}
  {#if type === 'codabar'}
    <div class="grid2">
      <label class="field">
        <span>{t('barcode.opt.codabarStart')}</span>
        <select value={o.codabarStart} onchange={(e) => code.updateOptions({ codabarStart: e.currentTarget.value as CodabarGuard })}>
          {#each GUARDS as g (g)}<option value={g}>{g}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{t('barcode.opt.codabarStop')}</span>
        <select value={o.codabarStop} onchange={(e) => code.updateOptions({ codabarStop: e.currentTarget.value as CodabarGuard })}>
          {#each GUARDS as g (g)}<option value={g}>{g}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
  {#if HAS_ADDON.has(type)}
    <label class="field">
      <span>{t('barcode.opt.addon')}</span>
      <input
        type="text"
        inputmode="numeric"
        maxlength="5"
        autocomplete="off"
        value={o.addon}
        oninput={(e) => code.updateOptions({ addon: e.currentTarget.value })} />
    </label>
    <p class="muted">{t('barcode.opt.addonHint')}</p>
  {/if}

  <div role="status" aria-live="polite" class="stack">
    {#if !res.ok}
      <p class="msg error">{t(res.error, res.params)}</p>
    {:else}
      {#each res.warnings as w (w)}<p class="msg warn">{t(w)}</p>{/each}
    {/if}
  </div>
</section>

<style>
  p {
    margin: 0;
  }
  .between {
    justify-content: space-between;
    align-items: flex-start;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .start {
    justify-self: start;
  }
</style>

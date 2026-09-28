<script lang="ts">
  import { BARCODE_GROUPS, BARCODE_LABELS, HAS_ADDON, HAS_RATIO, SAMPLE_VALUES, type BarcodeType, type CodabarGuard, type MsiCheck } from '../lib/barcode';
  import { barcode } from '../lib/barcode/state.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';

  const type = $derived(barcode.settings.type);
  const o = $derived(barcode.settings.options);
  const res = $derived(barcode.result);
  const GUARDS: CodabarGuard[] = ['A', 'B', 'C', 'D'];
  const MSI: MsiCheck[] = ['none', 'mod10', 'mod11', 'mod1010', 'mod1110'];
  // Whole-module ratios keep wide bars on the pixel grid.
  const RATIOS = [2, 3];
</script>

<section class="card stack" aria-labelledby="barcode-content-heading">
  <h2 id="barcode-content-heading">{t('section.content')}</h2>

  <label class="field">
    <span>{t('barcode.type')}</span>
    <select value={type} onchange={(e) => barcode.setType(e.currentTarget.value as BarcodeType)}>
      {#each BARCODE_GROUPS as g (g.id)}
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
    <input
      type="text"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      maxlength="200"
      inputmode={['ean13', 'ean8', 'upca', 'upce', 'itf', 'itf14', 'msi', 'pharmacode', 'code128c'].includes(type) ? 'numeric' : 'text'}
      bind:value={barcode.value} />
  </label>
  <div class="row between">
    <p class="muted grow">{t(`barcode.hint.${type}`)}</p>
    <span class="muted">{t('barcode.length', { count: formatNumber(Array.from(barcode.value).length) })}</span>
  </div>
  {#if barcode.value !== SAMPLE_VALUES[type]}
    <button type="button" class="btn small start" onclick={() => (barcode.value = SAMPLE_VALUES[type])}>{t('barcode.sample')}</button>
  {/if}

  {#if type === 'code39' || type === 'itf'}
    <label class="check">
      <input type="checkbox" checked={o.checkDigit} onchange={(e) => barcode.updateOptions({ checkDigit: e.currentTarget.checked })} />
      {t('barcode.opt.checkDigit')} ({type === 'code39' ? 'mod 43' : 'mod 10'})
    </label>
  {/if}
  {#if type === 'code39'}
    <label class="check">
      <input type="checkbox" checked={o.fullAscii} onchange={(e) => barcode.updateOptions({ fullAscii: e.currentTarget.checked })} />
      {t('barcode.opt.fullAscii')}
    </label>
  {/if}
  {#if HAS_RATIO.has(type)}
    <div class="field">
      <span class="label" id="ratio-label">{t('barcode.opt.wideRatio')}</span>
      <div class="segmented" role="group" aria-labelledby="ratio-label">
        {#each RATIOS as ratio (ratio)}
          <button type="button" aria-pressed={o.wideRatio === ratio} onclick={() => barcode.updateOptions({ wideRatio: ratio })}>1 : {ratio}</button>
        {/each}
      </div>
    </div>
  {/if}
  {#if type === 'msi'}
    <label class="field">
      <span>{t('barcode.opt.msiCheck')}</span>
      <select value={o.msiCheck} onchange={(e) => barcode.updateOptions({ msiCheck: e.currentTarget.value as MsiCheck })}>
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
        <select value={o.codabarStart} onchange={(e) => barcode.updateOptions({ codabarStart: e.currentTarget.value as CodabarGuard })}>
          {#each GUARDS as g (g)}<option value={g}>{g}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{t('barcode.opt.codabarStop')}</span>
        <select value={o.codabarStop} onchange={(e) => barcode.updateOptions({ codabarStop: e.currentTarget.value as CodabarGuard })}>
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
        oninput={(e) => barcode.updateOptions({ addon: e.currentTarget.value })} />
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

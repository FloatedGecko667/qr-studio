<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { outputForDistance } from '../lib/render/distance';
  import { renderSvg } from '../lib/render/svg';
  import { renderStyle } from '../lib/compose';
  import { LIMITS } from '../lib/settings';

  let distance = $state(1);

  const pipe = $derived(app.pipeline);
  const sym = $derived(pipe.status === 'ok' ? pipe.result.symbols[0] : null);
  const units = $derived(sym ? renderSvg(sym, renderStyle(app.settings.style, null, null)).widthUnits : 0);
  const result = $derived(sym && distance > 0 ? outputForDistance(distance, sym.width, units) : null);
  const clamped = $derived(result ? Math.min(LIMITS.sizeMm[1], Math.max(LIMITS.sizeMm[0], result.sizeMm)) : 0);

  function apply() {
    if (!result) return;
    app.updateOutput({ unit: 'mm', sizeMm: clamped });
  }
</script>

<section class="card stack" aria-labelledby="distance-heading">
  <h2 id="distance-heading">{t('distance.title')}</h2>
  <p class="muted">{t('distance.hint')}</p>
  <label class="field">
    <span>{t('distance.label')}</span>
    <input type="number" min="0.1" max="100" step="0.1" bind:value={distance} />
  </label>
  {#if result}
    <p>
      {t('distance.result', {
        symbol: formatNumber(Math.round(distance * 100)),
        size: formatNumber(clamped),
        module: result.moduleMm.toFixed(2),
      })}
    </p>
    {#if clamped !== result.sizeMm}<p class="msg warn">{t('distance.clamped', { max: LIMITS.sizeMm[1] })}</p>{/if}
    <div class="row">
      <button type="button" class="btn small" onclick={apply}>{t('distance.apply', { size: formatNumber(clamped) })}</button>
    </div>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
</style>

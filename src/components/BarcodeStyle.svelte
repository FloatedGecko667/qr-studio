<script lang="ts">
  import type { BarcodeFont, BarcodeStyle, Bearer } from '../lib/barcode/render';
  import { IS_MATRIX } from '../lib/barcode';
  import { BARCODE_LIMITS, moduleSize } from '../lib/barcode/settings';
  import type { BarcodeState } from '../lib/barcode/state.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { colorIssues } from '../lib/render/color';

  let { code }: { code: BarcodeState } = $props();

  const s = $derived(code.settings.style);
  const out = $derived(code.settings.output);
  const issues = $derived(colorIssues(s.fg, s.bg, s.transparent));
  /** Lengths are stored in modules and shown in the output unit. */
  const matrix = $derived(IS_MATRIX.has(code.settings.type));
  const scale = $derived.by(() => {
    const m = moduleSize(out, matrix ? 'matrix' : 'linear');
    return out.unit === 'px' ? m.px : m.mm;
  });
  const step = $derived(out.unit === 'px' ? 1 : 0.1);
  const FONTS: BarcodeFont[] = ['jetbrains', 'sans', 'serif', 'mono'];
  const BEARERS: Bearer[] = ['none', 'bars', 'frame'];

  const shown = (modules: number) => Math.round(modules * scale * 100) / 100;
  const range = (limits: readonly [number, number]) => ({ min: shown(limits[0]), max: shown(limits[1]) });

  function set<K extends keyof BarcodeStyle>(key: K, value: BarcodeStyle[K]) {
    code.updateStyle({ [key]: value } as Partial<BarcodeStyle>);
  }

  function setLength(key: 'height' | 'marginY' | 'fontSize' | 'textGap' | 'quietZone', e: Event & { currentTarget: HTMLInputElement }) {
    const v = Number(e.currentTarget.value);
    if (Number.isFinite(v)) set(key, v / scale);
    // Show the clamped value even when it did not change the stored one.
    const stored = code.settings.style[key];
    e.currentTarget.value = stored === 'auto' ? '' : String(shown(stored));
  }
</script>

<section class="card stack" aria-labelledby="barcode-style-heading">
  <h2 id="barcode-style-heading">{t('section.style')}</h2>
  <p class="muted">{t('barcode.style.unitNote', { unit: out.unit })}</p>

  <div class="grid2">
    {#if !matrix}
      <label class="field">
        <span>{t('barcode.style.height')} ({out.unit})</span>
        <input type="number" {...range(BARCODE_LIMITS.height)} {step} value={shown(s.height)} onchange={(e) => setLength('height', e)} />
      </label>
      <label class="field">
        <span>{t('barcode.style.marginY')} ({out.unit})</span>
        <input type="number" {...range(BARCODE_LIMITS.marginY)} {step} value={shown(s.marginY)} onchange={(e) => setLength('marginY', e)} />
      </label>
    {/if}
    <div class="field">
      <span class="label">{t(matrix ? 'barcode.style.quietZoneAll' : 'barcode.style.quietZone')} ({out.unit})</span>
      <label class="check">
        <input type="checkbox" checked={s.quietZone === 'auto'} onchange={(e) => set('quietZone', e.currentTarget.checked ? 'auto' : matrix ? 2 : 10)} />
        {t('barcode.style.quietAuto')}
      </label>
      {#if s.quietZone !== 'auto'}
        <input
          type="number"
          aria-label={t('barcode.style.quietZone')}
          {...range(BARCODE_LIMITS.quietZone)}
          step={scale}
          value={shown(s.quietZone)}
          onchange={(e) => setLength('quietZone', e)} />
      {/if}
    </div>
  </div>
  {#if !matrix}
    <div class="field start">
      <span class="label" id="bearer-label">{t('barcode.style.bearer')}</span>
      <div class="segmented" role="group" aria-labelledby="bearer-label">
        {#each BEARERS as b (b)}
          <button type="button" aria-pressed={s.bearer === b} onclick={() => set('bearer', b)}>{t(`barcode.bearer.${b}`)}</button>
        {/each}
      </div>
    </div>
  {/if}

  <label class="check">
    <input type="checkbox" checked={s.showText} onchange={(e) => set('showText', e.currentTarget.checked)} />
    {t('barcode.style.showText')}
  </label>
  {#if s.showText}
    <div class="grid2">
      <div class="field">
        <span class="label" id="text-pos-label">{t('barcode.style.textPosition')}</span>
        <div class="segmented" role="group" aria-labelledby="text-pos-label">
          <button type="button" aria-pressed={s.textPosition === 'bottom'} onclick={() => set('textPosition', 'bottom')}>{t('barcode.style.textBottom')}</button>
          <button type="button" aria-pressed={s.textPosition === 'top'} onclick={() => set('textPosition', 'top')}>{t('barcode.style.textTop')}</button>
        </div>
      </div>
      <label class="field">
        <span>{t('barcode.style.font')}</span>
        <select value={s.font} onchange={(e) => set('font', e.currentTarget.value as BarcodeFont)}>
          {#each FONTS as f (f)}<option value={f}>{t(`barcode.font.${f}`)}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>{t('barcode.style.fontSize')} ({out.unit})</span>
        <input type="number" {...range(BARCODE_LIMITS.fontSize)} {step} value={shown(s.fontSize)} onchange={(e) => setLength('fontSize', e)} />
      </label>
      <label class="field">
        <span>{t('barcode.style.textGap')} ({out.unit})</span>
        <input type="number" {...range(BARCODE_LIMITS.textGap)} {step} value={shown(s.textGap)} onchange={(e) => setLength('textGap', e)} />
      </label>
    </div>
  {/if}

  <div class="row">
    <label class="field">
      <span>{t('style.fg')}</span>
      <input type="color" value={s.fg} oninput={(e) => set('fg', e.currentTarget.value)} />
    </label>
    <label class="field">
      <span>{t('style.bg')}</span>
      <input type="color" value={s.bg} disabled={s.transparent} oninput={(e) => set('bg', e.currentTarget.value)} />
    </label>
    <label class="check">
      <input type="checkbox" checked={s.transparent} onchange={(e) => set('transparent', e.currentTarget.checked)} />
      {t('style.transparent')}
    </label>
  </div>
  {#each issues as issue (issue)}
    <p class="msg warn">{t(`style.${issue}`)}</p>
  {/each}
</section>

<style>
  p {
    margin: 0;
  }
  .start {
    justify-items: start;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { colorIssues } from '../lib/render/color';
  import { sanitizeImage } from '../lib/render/image';
  import { overlayCoverage, renderSvg } from '../lib/render/svg';
  import { renderStyle } from '../lib/compose';
  import { encode, prepareText } from '../lib/encoder';
  import { DESIGN_TEMPLATES, type DesignTemplate } from '../lib/render/designs';
  import { FINDER_SHAPES, GRADIENTS, MODULE_SHAPES, type FinderShape, type Gradient, type ModuleShape } from '../lib/render/shapes';
  import { normalizeStyle } from '../lib/normalize';
  import { DEFAULT_STYLE, LIMITS, type StyleSettings } from '../lib/settings';
  import { deletePreset, listPresets, newId, PRESET_LIMIT, savePreset, type Preset } from '../lib/storage/records';

  const s = $derived(app.settings.style);
  const ec = $derived(app.settings.symbol.ecLevel);
  const issues = $derived(colorIssues(s.gradient === 'none' ? [s.fg] : [s.fg, s.fg2], s.bg, s.transparent));
  let logoError = $state('');
  let presets: Preset[] = $state([]);
  let presetName = $state('');
  let presetMessage = $state('');

  // Thumbnails: one small sample code drawn in each template's style.
  const SAMPLE = encode(prepareText('QR').units, { type: 'model2', ecLevel: 'L', version: 1, mask: 'auto' }).symbols[0];
  const thumbs: Record<string, string> = Object.fromEntries(
    DESIGN_TEMPLATES.map((d) => [d.id, renderSvg(SAMPLE, renderStyle({ ...DEFAULT_STYLE, ...d.style, quietZone: 1 }, null, null)).svg]),
  );

  function applyDesign(d: DesignTemplate) {
    app.updateStyle(d.style);
  }

  const COVERAGE_LIMIT = { L: 5, M: 10, Q: 15, H: 20 } as const;
  const coverage = $derived.by(() => {
    if (s.overlay === 'none' || app.pipeline.status !== 'ok') return null;
    const sym = app.pipeline.result.symbols[0];
    return Math.round(overlayCoverage(sym, s.overlayRatio) * 1000) / 10;
  });

  onMount(async () => {
    presets = await listPresets();
  });

  /** The file as chosen, kept for this session so the background option can be re-applied. */
  let logoFile: File | null = null;

  async function loadLogo(file: File) {
    const r = await sanitizeImage(file, { clearBackground: s.logoRemoveBg });
    if ('error' in r) {
      logoError = t(`style.logo.${r.error}`);
      return;
    }
    app.logoDataUrl = r.dataUrl;
  }

  async function onLogo(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    logoError = '';
    if (!file) return;
    logoFile = file;
    await loadLogo(file);
  }

  async function setRemoveBg(on: boolean) {
    set('logoRemoveBg', on);
    if (logoFile) await loadLogo(logoFile);
  }

  function set<K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) {
    app.updateStyle({ [key]: value } as Partial<StyleSettings>);
  }

  async function addPreset() {
    const name = presetName.trim() || new Date().toLocaleString();
    const ok = await savePreset({ id: newId(), name: name.slice(0, 40), createdAt: Date.now(), style: { ...s }, logoDataUrl: app.logoDataUrl });
    presetMessage = ok ? '' : t('preset.full', { max: PRESET_LIMIT });
    presetName = '';
    presets = await listPresets();
  }

  function applyPreset(p: Preset) {
    app.settings.style = normalizeStyle({ ...s, ...(p.style as Partial<StyleSettings>) });
    app.logoDataUrl = p.logoDataUrl;
    app.persist();
  }

  async function removePreset(id: string) {
    await deletePreset(id);
    presets = await listPresets();
  }
</script>

<section class="card stack" aria-labelledby="style-heading">
  <h2 id="style-heading">{t('section.style')}</h2>

  <div class="grid2">
    <label class="field">
      <span>{t('style.quietZone')}: {s.quietZone}</span>
      <input type="range" min={LIMITS.quietZone[0]} max={LIMITS.quietZone[1]} value={s.quietZone} oninput={(e) => set('quietZone', Number(e.currentTarget.value))} />
    </label>
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
  </div>
  <p class="muted">{t('style.quietZoneHint')}</p>
  {#each issues as issue (issue)}
    <p class="msg warn">{t(`style.${issue}`)}</p>
  {/each}

  <h3>{t('design.title')}</h3>
  <div class="templates" role="group" aria-label={t('design.templates')}>
    {#each DESIGN_TEMPLATES as d (d.id)}
      <button type="button" class="tpl" onclick={() => applyDesign(d)} aria-label={t('design.apply', { name: t(`design.tpl.${d.id}`) })}>
        <!-- Rendered by renderSvg from a fixed sample and a built-in style. -->
        <span class="tpl-img" aria-hidden="true">{@html thumbs[d.id]}</span>
        <span class="tpl-name">{t(`design.tpl.${d.id}`)}</span>
      </button>
    {/each}
  </div>
  <div class="grid2">
    <label class="field">
      <span>{t('design.moduleShape')}</span>
      <select value={s.moduleShape} onchange={(e) => set('moduleShape', e.currentTarget.value as ModuleShape)}>
        {#each MODULE_SHAPES as m (m)}<option value={m}>{t(`design.shape.${m}`)}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>{t('design.gradient')}</span>
      <select value={s.gradient} onchange={(e) => set('gradient', e.currentTarget.value as Gradient)}>
        {#each GRADIENTS as g (g)}<option value={g}>{t(`design.gradient.${g}`)}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>{t('design.finderOuter')}</span>
      <select value={s.finderOuter} onchange={(e) => set('finderOuter', e.currentTarget.value as FinderShape)}>
        {#each FINDER_SHAPES as f (f)}<option value={f}>{t(`design.finder.${f}`)}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>{t('design.finderInner')}</span>
      <select value={s.finderInner} onchange={(e) => set('finderInner', e.currentTarget.value as FinderShape)}>
        {#each FINDER_SHAPES as f (f)}<option value={f}>{t(`design.finder.${f}`)}</option>{/each}
      </select>
    </label>
    {#if s.gradient !== 'none'}
      <label class="field">
        <span>{t('design.fg2')}</span>
        <input type="color" value={s.fg2} oninput={(e) => set('fg2', e.currentTarget.value)} />
      </label>
    {/if}
  </div>
  {#if app.settings.symbol.type !== 'model2' && (s.finderOuter !== 'square' || s.finderInner !== 'square')}
    <p class="muted">{t('design.singleFinder')}</p>
  {/if}

  <h3>{t('style.overlay')}</h3>
  <div class="segmented" role="group" aria-label={t('style.overlay')}>
    {#each ['none', 'logo', 'text'] as const as o (o)}
      <button type="button" aria-pressed={s.overlay === o} onclick={() => set('overlay', o)}>
        {t(`style.overlay${o[0].toUpperCase()}${o.slice(1)}`)}
      </button>
    {/each}
  </div>

  {#if s.overlay !== 'none'}
    <label class="field">
      <span>{t('style.overlayRatio')}: {Math.round(s.overlayRatio * 100)}%</span>
      <input
        type="range"
        min={LIMITS.overlayRatio[0]}
        max={LIMITS.overlayRatio[1]}
        step="0.01"
        value={s.overlayRatio}
        oninput={(e) => set('overlayRatio', Number(e.currentTarget.value))} />
    </label>
    {#if coverage !== null}
      <p class="muted">{t('style.overlayCoverage', { percent: coverage, level: ec, limit: COVERAGE_LIMIT[ec] })}</p>
      {#if coverage > COVERAGE_LIMIT[ec]}<p class="msg warn">{t('style.overlayTooLarge')}</p>{/if}
    {/if}
    {#if ec !== 'H' && app.settings.symbol.type !== 'micro'}
      <div class="row">
        <p class="msg warn grow">{t('style.overlayRecommendH')}</p>
        <button type="button" class="btn small" onclick={() => app.updateSymbol({ ecLevel: 'H' })}>{t('style.setH')}</button>
      </div>
    {/if}

    {#if s.overlay === 'logo'}
      <label class="field">
        <span>{t('style.logo')}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange={onLogo} />
      </label>
      {#if logoError}<p class="msg error" role="alert">{logoError}</p>{/if}
      <label class="check">
        <input type="checkbox" checked={s.logoRemoveBg} onchange={(e) => setRemoveBg(e.currentTarget.checked)} />
        {t('style.logoRemoveBg')}
      </label>
      <label class="check">
        <input type="checkbox" checked={s.logoClear} onchange={(e) => set('logoClear', e.currentTarget.checked)} />
        {t('style.logoClear')}
      </label>
      {#if !s.logoClear}<p class="muted">{t('style.logoClearOff')}</p>{/if}
      {#if app.logoDataUrl}
        <div class="row">
          <img src={app.logoDataUrl} alt="" class="thumb" />
          <button type="button" class="btn small danger" onclick={() => (app.logoDataUrl = null)}>{t('style.logoRemove')}</button>
        </div>
      {/if}
    {:else}
      <div class="grid2">
        <label class="field">
          <span>{t('style.centerText')}</span>
          <input type="text" maxlength="8" value={s.centerText} oninput={(e) => set('centerText', e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>{t('style.enclosure')}</span>
          <select value={s.enclosure} onchange={(e) => set('enclosure', e.currentTarget.value as StyleSettings['enclosure'])}>
            <option value="circle">{t('style.enclosureCircle')}</option>
            <option value="square">{t('style.enclosureSquare')}</option>
            <option value="none">{t('style.enclosureNone')}</option>
          </select>
        </label>
      </div>
    {/if}
  {/if}

  <h3>{t('style.label')}</h3>
  <input
    type="text"
    maxlength={LIMITS.labelChars}
    placeholder={t('style.labelPlaceholder')}
    aria-label={t('style.label')}
    value={s.label}
    oninput={(e) => set('label', e.currentTarget.value)} />
  {#if s.label.trim()}
    <div class="grid2">
      <label class="field">
        <span>{t('style.labelPosition')}</span>
        <select value={s.labelPosition} onchange={(e) => set('labelPosition', e.currentTarget.value as StyleSettings['labelPosition'])}>
          <option value="top">{t('style.labelTop')}</option>
          <option value="bottom">{t('style.labelBottom')}</option>
        </select>
      </label>
      <div class="row">
        <label class="field">
          <span>{t('style.labelColor')}</span>
          <input type="color" value={s.labelColor} oninput={(e) => set('labelColor', e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>{t('style.frameColor')}</span>
          <input type="color" value={s.frameColor} oninput={(e) => set('frameColor', e.currentTarget.value)} />
        </label>
      </div>
      <label class="field">
        <span>{t('style.frameRadius')}: {s.frameRadius}</span>
        <input
          type="range"
          min={LIMITS.frameRadius[0]}
          max={LIMITS.frameRadius[1]}
          step="0.5"
          value={s.frameRadius}
          oninput={(e) => set('frameRadius', Number(e.currentTarget.value))} />
      </label>
    </div>
  {/if}

  <details>
    <summary>{t('preset.title')}</summary>
    <div class="stack presets">
      <div class="row">
        <input type="text" maxlength="40" placeholder={t('preset.name')} aria-label={t('preset.name')} bind:value={presetName} class="grow" />
        <button type="button" class="btn small" onclick={addPreset}>{t('preset.save')}</button>
      </div>
      {#if presetMessage}<p class="msg warn">{presetMessage}</p>{/if}
      {#if presets.length === 0}
        <p class="muted">{t('preset.empty')}</p>
      {/if}
      <ul>
        {#each presets as p (p.id)}
          <li class="row">
            <span class="grow">{p.name}</span>
            <button type="button" class="btn small" onclick={() => applyPreset(p)}>{t('preset.apply')}</button>
            <button type="button" class="btn small danger" onclick={() => removePreset(p.id)}>{t('preset.delete')}</button>
          </li>
        {/each}
      </ul>
    </div>
  </details>
</section>

<style>
  p {
    margin: 0;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .thumb {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
  }
  .templates {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px;
  }
  .tpl {
    display: grid;
    gap: 4px;
    justify-items: center;
    padding: 6px 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    font-size: 11px;
  }
  .tpl:hover {
    border-color: var(--accent);
  }
  .tpl-img {
    width: 52px;
    line-height: 0;
  }
  .tpl-img :global(svg) {
    width: 100%;
    height: auto;
  }
  .tpl-name {
    text-align: center;
    line-height: 1.2;
  }
  details summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }
  .presets {
    margin-top: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
</style>

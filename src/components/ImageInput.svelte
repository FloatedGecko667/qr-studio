<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { imageByteBudget } from '../lib/imageBudget';
  import type { ImageEncoding } from '../lib/imageData';
  import { fitImage, type FitFormat, type FittedImage } from '../lib/render/imageFit';

  const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
  const EDGES = [32, 64, 128, 256, 512, 1024];

  const values = $derived(app.fields.image);
  const encoding = $derived((values.encoding as ImageEncoding) || 'binary');
  const format = $derived((values.format as FitFormat) || 'webp');
  const maxEdge = $derived(Number(values.maxEdge) || 256);
  const maxQuality = $derived(Number(values.maxQuality) || 0.8);
  const budget = $derived(imageByteBudget(app.settings.symbol, encoding, `image/${format}`));

  /** Original upload; kept in memory only so the image can be refitted when settings change. */
  let source: File | null = $state(null);
  let fitted: Omit<FittedImage, 'bytes'> | null = $state(null);
  let status: 'idle' | 'working' | 'error' | 'tooSmall' = $state('idle');
  let error = $state('');
  let token = 0;

  const imageBytes = $derived(values.image instanceof Uint8Array ? values.image : null);
  const previewUrl = $derived(imageBytes ? URL.createObjectURL(new Blob([imageBytes as Uint8Array<ArrayBuffer>], { type: String(values.mime) })) : null);
  $effect(() => {
    const url = previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });

  // Refit whenever the source, the budget (symbol settings) or the fit options change.
  $effect(() => {
    const file = source;
    const opts = { format, maxEdge, maxQuality };
    const target = budget;
    if (!file) return;
    const id = ++token;
    status = 'working';
    const timer = setTimeout(async () => {
      try {
        const r = await fitImage(file, target, opts);
        if (id !== token) return;
        if (!r) {
          status = 'tooSmall';
          app.fields.image.image = null;
          fitted = null;
          return;
        }
        app.fields.image.image = r.bytes;
        app.fields.image.mime = r.mime;
        fitted = { mime: r.mime, width: r.width, height: r.height, quality: r.quality };
        status = 'idle';
      } catch {
        if (id !== token) return;
        status = 'error';
        error = t('style.logo.decode');
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    error = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      status = 'error';
      error = t('field.imageType');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      status = 'error';
      error = t('field.fileTooLarge', { max: formatNumber(MAX_SOURCE_BYTES) });
      return;
    }
    source = file;
  }

  function set(key: string, value: string) {
    app.setField(key, value);
  }
</script>

<div class="stack">
  <label class="field">
    <span>{t('field.imageFile')}</span>
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onchange={onFile} />
  </label>

  <div class="grid2">
    <label class="field">
      <span>{t('field.imageEncoding')}</span>
      <select value={encoding} onchange={(e) => set('encoding', e.currentTarget.value)}>
        <option value="binary">{t('option.imageBinary')}</option>
        <option value="base64">Base64 (data URL)</option>
        <option value="base45">Base45</option>
      </select>
    </label>
    <label class="field">
      <span>{t('field.imageFormat')}</span>
      <select value={format} onchange={(e) => set('format', e.currentTarget.value)}>
        <option value="webp">WebP</option>
        <option value="jpeg">JPEG</option>
      </select>
    </label>
    <label class="field">
      <span>{t('field.imageMaxEdge')}</span>
      <select value={String(maxEdge)} onchange={(e) => set('maxEdge', e.currentTarget.value)}>
        {#each EDGES as edge (edge)}<option value={String(edge)}>{edge}px</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>{t('field.imageQuality')}: {Math.round(maxQuality * 100)}</span>
      <input type="range" min="0.1" max="1" step="0.05" value={maxQuality} oninput={(e) => set('maxQuality', e.currentTarget.value)} />
    </label>
  </div>

  <p class="muted">{t(`field.imageEncodingHint.${encoding}`)}</p>
  <p class="muted">{t('field.imageBudget', { n: formatNumber(budget) })}</p>

  <div role="status" aria-live="polite">
    {#if status === 'working'}
      <p class="muted">{t('field.imageWorking')}</p>
    {:else if status === 'tooSmall'}
      <p class="msg error">{budget === 0 ? t('field.imageUnsupported') : t('field.imageTooSmall')}</p>
    {:else if status === 'error'}
      <p class="msg error">{error}</p>
    {/if}
  </div>

  {#if previewUrl && imageBytes}
    <div class="row preview">
      <img src={previewUrl} alt={t('field.imagePreview')} />
      <div class="muted">
        {#if fitted}
          <div>{fitted.width} × {fitted.height}px · {fitted.mime.replace('image/', '').toUpperCase()}</div>
          <div>{fitted.quality === null ? t('field.imageOriginal') : t('field.imageQualityUsed', { q: Math.round(fitted.quality * 100) })}</div>
        {/if}
        <div>{formatNumber(imageBytes.length)} / {formatNumber(budget)} B</div>
      </div>
    </div>
  {/if}
</div>

<style>
  p {
    margin: 0;
  }
  .preview img {
    width: 96px;
    height: 96px;
    object-fit: contain;
    image-rendering: pixelated;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface) 0% 50%) 50% / 12px 12px;
  }
</style>

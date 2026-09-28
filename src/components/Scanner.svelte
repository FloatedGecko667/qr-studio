<script lang="ts">
  import { onDestroy } from 'svelte';
  import { copyText } from '../lib/export/download';
  import { t } from '../lib/i18n/index.svelte';
  import { SequenceCollector, type ScanOutcome } from '../lib/scan';

  const MAX_EDGE = 1280;
  const INTERVAL_MS = 250;

  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = $state(null);
  let error = $state('');
  let result = $state<ScanOutcome | null>(null);
  let pending: [number, number][] = $state([]);
  let copied = $state(false);
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const collector = new SequenceCollector();
  const canvas = document.createElement('canvas');

  const isWebUrl = $derived(!!result && /^https?:\/\/\S+$/i.test(result.text.trim()));

  function frameData(source: CanvasImageSource, w: number, h: number): ImageData {
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /** Reads all symbols in the image; returns true once a complete payload is found. */
  async function process(image: ImageData, tryHarder: boolean): Promise<boolean> {
    const { readSymbols } = await import('../lib/verify');
    const symbols = await readSymbols(image, 16, tryHarder);
    for (const s of symbols) {
      const outcome = collector.add(s);
      if (outcome) {
        result = outcome;
        pending = [];
        return true;
      }
    }
    pending = collector.pending();
    return false;
  }

  async function tick() {
    timer = null;
    if (!stream || !video || busy) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      busy = true;
      try {
        if (await process(frameData(video, video.videoWidth, video.videoHeight), false)) {
          stop();
          return;
        }
      } catch {
        error = t('scan.decodeError');
      } finally {
        busy = false;
      }
    }
    timer = setTimeout(tick, INTERVAL_MS);
  }

  async function start() {
    error = '';
    result = null;
    collector.reset();
    pending = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      error = t('scan.noCamera');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      error = t('scan.permission');
      return;
    }
    video!.srcObject = stream;
    await video!.play().catch(() => undefined);
    timer = setTimeout(tick, INTERVAL_MS);
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    if (video) video.srcObject = null;
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    error = '';
    result = null;
    for (const file of files) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        error = t('scan.imageError');
        return;
      }
      const found = await process(frameData(bitmap, bitmap.width, bitmap.height), true);
      bitmap.close();
      if (found) return;
    }
    if (!pending.length) error = t('scan.notFound');
  }

  async function copy() {
    if (!result) return;
    try {
      await copyText(result.text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = t('output.copyFailed');
    }
  }

  onDestroy(stop);
</script>

<section class="card stack" aria-labelledby="scan-heading">
  <h2 id="scan-heading">{t('scan.title')}</h2>
  <p class="muted">{t('scan.hint')}</p>

  <div class="row">
    {#if stream}
      <button type="button" class="btn" onclick={stop}>{t('scan.stop')}</button>
    {:else}
      <button type="button" class="btn primary" onclick={start}>{t('scan.start')}</button>
    {/if}
    <label class="btn">
      {t('scan.file')}
      <input type="file" accept="image/*" multiple class="sr-only" onchange={onFile} />
    </label>
  </div>

  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} class:hidden={!stream} muted playsinline aria-label={t('scan.camera')}></video>

  <div role="status" aria-live="polite" class="stack">
    {#each pending as [found, total], i (i)}
      <p class="msg warn">{t('scan.sequence', { found, total })}</p>
    {/each}
    {#if error}<p class="msg error">{error}</p>{/if}
  </div>

  {#if result}
    <div class="result stack">
      <div class="row meta">
        <span class="badge">{result.format}</span>
        {#if result.parts > 1}<span class="badge">{t('scan.parts', { n: result.parts })}</span>{/if}
        {#if result.compressed}<span class="badge">{t('scan.inflated')}</span>{/if}
      </div>
      <pre>{result.text}</pre>
      <div class="row">
        <button type="button" class="btn small" onclick={copy}>{copied ? t('output.copied') : t('output.copyText')}</button>
        {#if isWebUrl}
          <a class="btn small" href={result.text.trim()} target="_blank" rel="noopener noreferrer">{t('scan.open')}</a>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  video {
    width: 100%;
    max-height: 60vh;
    border-radius: 8px;
    background: #000;
    object-fit: contain;
  }
  video.hidden {
    display: none;
  }
  .result {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: inherit;
    font-size: 13px;
    max-height: 40vh;
    overflow: auto;
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-2);
    font-weight: 600;
  }
  a.btn {
    text-decoration: none;
    color: inherit;
  }
</style>

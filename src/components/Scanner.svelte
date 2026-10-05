<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { copyText } from '../lib/export/download';
  import { t } from '../lib/i18n/index.svelte';
  import { missing, partialView, received, SequenceCollector, type PartialSequence, type ScanOutcome } from '../lib/scan';
  import { deletePartial, listPartials, savePartial } from '../lib/storage/scanStore';
  import { detectImage, extensionForMime } from '../lib/imageData';
  import { downloadBlob } from '../lib/export/download';
  import { scanLog } from '../lib/scanLogState.svelte';
  import ScanActions from './ScanActions.svelte';
  import ScanLog from './ScanLog.svelte';

  const MAX_EDGE = 1280;
  const INTERVAL_MS = 250;

  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = $state(null);
  let error = $state('');
  let result = $state<ScanOutcome | null>(null);
  /** Incomplete structured-append sequences (also restored from earlier sessions). */
  let partials: PartialSequence[] = $state.raw([]);
  /** The symbol read most recently, for the live "k of n" display. */
  let lastRead: { key: string; index: number; total: number; at: number } | null = $state(null);
  let viewKey: string | null = $state(null);
  let notice = $state('');
  let copied = $state(false);
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const collector = new SequenceCollector();
  const canvas = document.createElement('canvas');

  const live = $derived(lastRead ? partials.find((p) => p.key === lastRead!.key) : undefined);
  const viewed = $derived(viewKey ? partials.find((p) => p.key === viewKey) : undefined);
  const view = $derived(viewed ? partialView(viewed) : null);

  // Scans wait for this so a fast first read cannot overwrite a saved sequence before it loads.
  let loaded: Promise<void> = Promise.resolve();
  onMount(() => {
    loaded = listPartials().then((saved) => {
      collector.load(saved);
      partials = collector.list();
    });
  });

  const image = $derived(result ? detectImage(result.bytes, result.text) : null);
  const imageUrl = $derived(image ? URL.createObjectURL(new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: image.mime })) : null);
  $effect(() => {
    const url = imageUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });

  function saveImage() {
    if (!image) return;
    downloadBlob(new Blob([image.bytes as Uint8Array<ArrayBuffer>], { type: image.mime }), `scanned.${extensionForMime(image.mime)}`);
  }

  function frameData(source: CanvasImageSource, w: number, h: number): ImageData {
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * Reads the symbols in the image and logs each complete payload. Returns true once one is
   * found; with `all`, keeps going so every code in the image is logged.
   */
  async function process(image: ImageData, tryHarder: boolean, all: boolean): Promise<boolean> {
    let found = false;
    await loaded;
    const { readSymbols, SCAN_FORMATS } = await import('../lib/verify');
    const read = await readSymbols(image, 16, tryHarder, SCAN_FORMATS);
    // QR symbols first, so a barcode on the same package does not cut a structured-append read short.
    const isQr = (f: string) => /QR/i.test(f);
    const symbols = [...read].sort((a, b) => Number(isQr(b.format)) - Number(isQr(a.format)));
    for (const s of symbols) {
      const { outcome, key, changed, conflict } = collector.add(s);
      if (key) {
        if (changed || lastRead?.key !== key || lastRead.index !== s.sequenceIndex) {
          lastRead = { key, index: s.sequenceIndex, total: s.sequenceSize, at: Date.now() };
        }
        if (conflict) notice = t('scan.conflict');
        // Save every new part at once so an interrupted camera loses nothing.
        if (changed) {
          const partial = collector.get(key);
          if (partial) void savePartial(partial);
          else void deletePartial(key);
        }
      }
      if (changed) partials = collector.list();
      if (outcome) {
        // A code held in front of the camera is read on every frame; the log ignores such repeats.
        if (scanLog.record(outcome) !== 'repeat' || !result) result = outcome;
        if (viewKey === key) viewKey = null;
        found = true;
        if (!all) return true;
      }
    }
    return found;
  }

  async function tick() {
    timer = null;
    if (!stream || !video || busy) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      busy = true;
      try {
        const continuous = scanLog.prefs.continuous;
        if ((await process(frameData(video, video.videoWidth, video.videoHeight), false, continuous)) && !continuous) {
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
    scanLog.unlockAudio();
    error = '';
    notice = '';
    result = null;
    lastRead = null;
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
    // The OS or another app can take the camera away; the parts read so far are already saved.
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (!stream) return;
        stop();
        notice = t(partials.length ? 'scan.interruptedSaved' : 'scan.interrupted');
      });
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
    // Every code in every chosen image goes to the log; the last one is shown.
    let found = false;
    for (const file of files) {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        error = t('scan.imageError');
        return;
      }
      if (await process(frameData(bitmap, bitmap.width, bitmap.height), true, true)) found = true;
      bitmap.close();
    }
    if (!found && !partials.length) error = t('scan.notFound');
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

  async function copyPartial(p: PartialSequence) {
    const v = partialView(p);
    const text = v.segments.map((seg) => (seg.kind === 'text' ? seg.text : gapLabel(seg.from, seg.to, p.total))).join('');
    try {
      await copyText(text);
      notice = t('output.copied');
    } catch {
      error = t('output.copyFailed');
    }
  }

  async function discard(p: PartialSequence) {
    if (!confirm(t('scan.discardConfirm'))) return;
    collector.remove(p.key);
    await deletePartial(p.key);
    partials = collector.list();
    if (viewKey === p.key) viewKey = null;
    if (lastRead?.key === p.key) lastRead = null;
  }

  const positions = (list: number[]) => list.map((i) => i + 1).join(', ');
  const gapLabel = (from: number, to: number, total: number) =>
    `\n［${t('scan.gap', { range: from === to ? `${from + 1}` : `${from + 1}–${to + 1}`, total })}］\n`;

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
  <div class="row">
    <label class="check">
      <input type="checkbox" checked={scanLog.prefs.continuous} onchange={(e) => scanLog.setPrefs({ continuous: e.currentTarget.checked })} />
      {t('scanLog.continuous')}
    </label>
    <label class="check">
      <input type="checkbox" checked={scanLog.prefs.beep} onchange={(e) => {
          scanLog.setPrefs({ beep: e.currentTarget.checked });
          scanLog.unlockAudio();
        }} />
      {t('scanLog.beep')}
    </label>
  </div>
  {#if scanLog.prefs.continuous}<p class="muted">{t('scanLog.continuousHint')}</p>{/if}

  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} class:hidden={!stream} muted playsinline aria-label={t('scan.camera')}></video>

  <div role="status" aria-live="polite" class="stack">
    {#if lastRead && live}
      <div class="live stack">
        <p class="now">{t('scan.readPart', { index: lastRead.index + 1, total: lastRead.total })}</p>
        {@render grid(live, lastRead.index)}
        <p class="muted">
          {t('scan.progress', { found: received(live).length, total: live.total })} · {t('scan.missingList', { list: positions(missing(live)) })}
        </p>
      </div>
    {/if}
    {#if notice}<p class="msg warn">{notice}</p>{/if}
    {#if error}<p class="msg error">{error}</p>{/if}
  </div>

  {#if partials.length}
    <div class="stack partials">
      <h3>{t('scan.partialTitle')}</h3>
      <p class="muted">{t('scan.partialHint')}</p>
      {#each partials as p (p.key)}
        <div class="partial stack">
          <div class="row meta">
            <span class="badge">{p.format}</span>
            <span class="badge">{t('scan.progress', { found: received(p).length, total: p.total })}</span>
            <time class="muted" datetime={new Date(p.updatedAt).toISOString()}>{new Date(p.updatedAt).toLocaleString()}</time>
          </div>
          {@render grid(p, lastRead?.key === p.key ? lastRead.index : -1)}
          <p class="muted">{t('scan.missingList', { list: positions(missing(p)) })}</p>
          <div class="row">
            <button type="button" class="btn small" aria-expanded={viewKey === p.key} onclick={() => (viewKey = viewKey === p.key ? null : p.key)}>
              {viewKey === p.key ? t('scan.hidePartial') : t('scan.showPartial')}
            </button>
            <button type="button" class="btn small" onclick={() => copyPartial(p)}>{t('scan.copyPartial')}</button>
            <button type="button" class="btn small danger" onclick={() => discard(p)}>{t('scan.discard')}</button>
          </div>
          {#if viewKey === p.key && view}
            {#if view.compressed}<p class="msg warn">{t('scan.partialCompressed')}</p>{/if}
            {#if view.undecodable}
              <p class="msg warn">{t('scan.partialUndecodable')}</p>
            {:else if view.segments.every((seg) => seg.kind === 'missing' || seg.text === '')}
              <p class="muted">{t('scan.partialEmpty')}</p>
            {/if}
            <pre class="partial-text">{#each view.segments as seg, i (i)}{#if seg.kind === 'text'}{seg.text}{:else}<span class="gap">{gapLabel(seg.from, seg.to, p.total)}</span>{/if}{/each}</pre>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#snippet grid(p: PartialSequence, current: number)}
    <ol class="cells" aria-label={t('scan.progress', { found: received(p).length, total: p.total })}>
      {#each Array.from({ length: p.total }, (_, i) => i) as i (i)}
        <li class:have={p.parts[i] !== undefined} class:current={i === current} title={t(p.parts[i] !== undefined ? 'scan.cellRead' : 'scan.cellMissing', { n: i + 1 })}>
          {i + 1}
        </li>
      {/each}
    </ol>
  {/snippet}

  {#if result}
    <div class="result stack">
      <div class="row meta">
        <span class="badge">{result.format}</span>
        {#if result.parts > 1}<span class="badge">{t('scan.parts', { n: result.parts })}</span>{/if}
        {#if result.compressed}<span class="badge">{t('scan.inflated')}</span>{/if}
      </div>
      {#if image && imageUrl}
        <img class="scanned code-surface" src={imageUrl} alt={t('scan.imageAlt')} />
        <p class="muted">{t('scan.image', { mime: image.mime, encoding: image.encoding, n: image.bytes.length })}</p>
      {:else}
        <pre>{result.text}</pre>
      {/if}
      <div class="row">
        {#if image}<button type="button" class="btn small primary" onclick={saveImage}>{t('scan.saveImage')}</button>{/if}
        <button type="button" class="btn small" onclick={copy}>{copied ? t('output.copied') : t('output.copyText')}</button>
      </div>
      {#if !image}<ScanActions text={result.text} />{/if}
    </div>
  {/if}
</section>

<ScanLog />

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
  .scanned {
    max-width: 100%;
    max-height: 50vh;
    align-self: start;
    border: 1px solid var(--border);
    border-radius: 6px;
    image-rendering: pixelated;
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
  .live {
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 10px 12px;
    gap: 8px;
  }
  .now {
    font-weight: 700;
    font-size: 15px;
  }
  .partials {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .partial {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    gap: 8px;
  }
  .partial-text {
    border-top: 1px dashed var(--border);
    padding-top: 8px;
  }
  .gap {
    color: var(--warn);
    font-weight: 700;
  }
  .cells {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cells li {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px dashed var(--border);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 700;
  }
  .cells li.have {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-text);
  }
  .cells li.current {
    outline: 3px solid var(--ok);
    outline-offset: 1px;
  }
</style>

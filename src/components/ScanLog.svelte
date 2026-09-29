<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { copyText, downloadBlob } from '../lib/export/download';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import { toCsv, type ScanLogMode } from '../lib/scanLog';
  import { scanLog } from '../lib/scanLogState.svelte';

  /** Rows rendered at once; the full log is still exported. */
  const PAGE = 100;

  let shown = $state(PAGE);
  let notice = $state('');
  const entries = $derived(scanLog.entries);
  const total = $derived(entries.reduce((n, e) => n + e.count, 0));

  onMount(() => void scanLog.load());

  function flash(msg: string) {
    notice = msg;
    setTimeout(() => {
      if (notice === msg) notice = '';
    }, 2500);
  }

  function exportCsv() {
    const csv = toCsv(entries, [t('scanLog.col.time'), t('scanLog.col.format'), t('scanLog.col.content'), t('scanLog.col.count')]);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `scan-log-${stamp}.csv`);
  }

  async function copyAll() {
    try {
      await copyText([...entries].reverse().map((e) => e.text).join('\n'));
      flash(t('output.copied'));
    } catch {
      flash(t('output.copyFailed'));
    }
  }

  function clearAll() {
    if (confirm(t('scanLog.clearConfirm'))) void scanLog.clear();
  }

  function setMode(mode: ScanLogMode) {
    scanLog.setPrefs({ mode });
  }

  const time = (at: number) =>
    new Date(at).toLocaleString(app.settings.locale === 'en' ? 'en-US' : 'ja-JP', { dateStyle: 'short', timeStyle: 'medium' });
</script>

<section class="card stack" aria-labelledby="scan-log-heading">
  <div class="row head">
    <h2 id="scan-log-heading">{t('scanLog.title')}</h2>
    <span class="muted">{t('scanLog.summary', { rows: formatNumber(entries.length), reads: formatNumber(total) })}</span>
  </div>

  <div class="row">
    <div class="segmented" role="group" aria-label={t('scanLog.mode')}>
      <button type="button" aria-pressed={scanLog.prefs.mode === 'each'} onclick={() => setMode('each')}>{t('scanLog.modeEach')}</button>
      <button type="button" aria-pressed={scanLog.prefs.mode === 'count'} onclick={() => setMode('count')}>{t('scanLog.modeCount')}</button>
    </div>
  </div>

  <div class="row">
    <button type="button" class="btn small" disabled={!entries.length} onclick={exportCsv}>{t('scanLog.exportCsv')}</button>
    <button type="button" class="btn small" disabled={!entries.length} onclick={copyAll}>{t('scanLog.copyAll')}</button>
    <button type="button" class="btn small danger" disabled={!entries.length} onclick={clearAll}>{t('scanLog.clear')}</button>
  </div>
  {#if notice}<p class="msg ok" role="status">{notice}</p>{/if}

  {#if entries.length}
    <ol class="log" aria-live="polite">
      {#each entries.slice(0, shown) as e (e.id)}
        <li>
          <div class="meta">
            <span class="badge">{e.format}</span>
            {#if e.count > 1}<span class="badge count">×{e.count}</span>{/if}
            <time class="muted" datetime={new Date(e.lastAt).toISOString()}>{time(e.lastAt)}</time>
          </div>
          <span class="text">{e.text}</span>
          <button type="button" class="btn small danger" aria-label={`${t('history.delete')}: ${e.text.slice(0, 40)}`} onclick={() => scanLog.remove(e.id)}>
            {t('history.delete')}
          </button>
        </li>
      {/each}
    </ol>
    {#if entries.length > shown}
      <button type="button" class="btn small" onclick={() => (shown += PAGE)}>{t('scanLog.more', { n: formatNumber(entries.length - shown) })}</button>
    {/if}
  {:else}
    <p class="muted">{t('scanLog.empty')}</p>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  .head {
    justify-content: space-between;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'meta del' 'text del';
    gap: 2px 8px;
    align-items: center;
    padding: 8px 10px;
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  .meta {
    grid-area: meta;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .text {
    grid-area: text;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  li .btn {
    grid-area: del;
  }
  .badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .badge.count {
    background: var(--ok-bg);
    color: var(--ok);
    font-weight: 700;
  }
</style>

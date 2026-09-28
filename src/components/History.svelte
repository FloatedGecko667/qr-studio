<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { downloadBlob } from '../lib/export/download';
  import { t } from '../lib/i18n/index.svelte';
  import { PAYLOAD_KINDS, type PayloadKind } from '../lib/payload';
  import { exportHistory, parseHistory } from '../lib/storage/historyJson';
  import { addHistory, clearHistory, deleteHistory, HISTORY_LIMIT, listHistory, type HistoryEntry } from '../lib/storage/records';

  let { onRestore }: { onRestore: () => void } = $props();
  let entries: HistoryEntry[] = $state([]);
  let message = $state('');
  let messageKind: 'ok' | 'error' = $state('ok');

  const refresh = async () => {
    entries = await listHistory();
  };
  onMount(refresh);

  function restore(e: HistoryEntry) {
    if (!(PAYLOAD_KINDS as readonly string[]).includes(e.kind)) return;
    app.restore(e.kind as PayloadKind, e.fields, e.symbol, e.style, e.logoDataUrl);
    onRestore();
  }

  async function remove(id: string) {
    await deleteHistory(id);
    await refresh();
  }

  async function clearAll() {
    if (!confirm(t('history.clearConfirm'))) return;
    await clearHistory();
    await refresh();
  }

  function exportJson() {
    downloadBlob(new Blob([exportHistory($state.snapshot(entries) as HistoryEntry[])], { type: 'application/json' }), 'qr-studio-history.json');
  }

  async function importJson(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseHistory(await file.text());
    if (!parsed) {
      message = t('history.importFailed');
      messageKind = 'error';
      return;
    }
    for (const entry of parsed) await addHistory(entry);
    await refresh();
    message = t('history.imported', { count: parsed.length });
    messageKind = 'ok';
  }
</script>

<section class="card stack" aria-labelledby="history-heading">
  <h2 id="history-heading">{t('history.title')}</h2>
  <p class="muted">{t('history.limit', { max: HISTORY_LIMIT })}</p>
  <div class="row">
    <button type="button" class="btn small" disabled={!entries.length} onclick={exportJson}>{t('history.export')}</button>
    <label class="btn small">
      {t('history.import')}
      <input type="file" accept="application/json,.json" class="sr-only" onchange={importJson} />
    </label>
    <button type="button" class="btn small danger" disabled={!entries.length} onclick={clearAll}>{t('history.clear')}</button>
  </div>
  <div role="status" aria-live="polite">
    {#if message}<p class="msg {messageKind}">{message}</p>{/if}
  </div>

  {#if entries.length === 0}
    <p class="muted">{t('history.empty')}</p>
  {:else}
    <ul>
      {#each entries as e (e.id)}
        <li>
          <div class="meta">
            <span class="kind">{t(`kind.${e.kind}`)}</span>
            <time datetime={new Date(e.createdAt).toISOString()}>{new Date(e.createdAt).toLocaleString()}</time>
          </div>
          <div class="summary">{e.summary}</div>
          <div class="row">
            <button type="button" class="btn small" onclick={() => restore(e)}>{t('history.restore')}</button>
            <button type="button" class="btn small danger" onclick={() => remove(e.id)}>{t('history.delete')}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }
  .meta {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
  }
  .kind {
    font-weight: 700;
    color: var(--accent);
  }
  .summary {
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 13px;
    max-height: 4.5em;
    overflow: hidden;
  }
</style>

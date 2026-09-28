<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { downloadBlob } from '../lib/export/download';
  import { t } from '../lib/i18n/index.svelte';
  import { PAYLOAD_KINDS, type PayloadKind } from '../lib/payload';
  import { MODES, type Mode } from '../lib/settings';
  import { exportHistory, parseHistory } from '../lib/storage/historyJson';
  import { addHistory, clearHistory, deleteHistory, HISTORY_LIMIT, listHistory, type HistoryEntry } from '../lib/storage/records';

  let { onRestore, mode }: { onRestore: (mode: Mode) => void; mode: Mode } = $props();
  let entries: HistoryEntry[] = $state([]);
  // Start with the current mode's entries; the filter is independent afterwards.
  let filter = $state<'all' | Mode>(untrack(() => mode));
  const MATRIX_TYPES = ['datamatrix', 'gs1-datamatrix'];
  function modeOf(e: HistoryEntry): Mode {
    if (e.kind === 'datamatrix' || (e.kind === 'barcode' && MATRIX_TYPES.includes(String(e.fields.type)))) return 'datamatrix';
    return e.kind === 'barcode' ? 'barcode' : 'qr';
  }
  const shown = $derived(filter === 'all' ? entries : entries.filter((e) => modeOf(e) === filter));
  let message = $state('');
  let messageKind: 'ok' | 'error' = $state('ok');

  const refresh = async () => {
    entries = await listHistory();
  };
  onMount(refresh);

  async function restore(e: HistoryEntry) {
    const mode = modeOf(e);
    if (mode !== 'qr') {
      const { barcode, matrixCode } = await import('../lib/barcode/state.svelte');
      (mode === 'datamatrix' ? matrixCode : barcode).restore(e.fields, e.symbol, e.style);
      onRestore(mode);
      return;
    }
    if (!(PAYLOAD_KINDS as readonly string[]).includes(e.kind)) return;
    app.restore(e.kind as PayloadKind, e.fields, e.symbol, e.style, e.logoDataUrl);
    onRestore('qr');
  }

  function kindLabel(e: HistoryEntry): string {
    const mode = modeOf(e);
    if (mode === 'qr') return `${t('mode.qr')} · ${t(`kind.${e.kind}`)}`;
    const label = typeof e.fields.label === 'string' ? e.fields.label.slice(0, 40) : '';
    return `${t(`mode.${mode}`)} · ${label}`;
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
  <div class="segmented" role="group" aria-label={t('history.filter')}>
    {#each ['all', ...MODES] as const as f (f)}
      <button type="button" aria-pressed={filter === f} onclick={() => (filter = f)}>
        {f === 'all' ? t('history.filterAll') : t(`mode.${f}`)}
      </button>
    {/each}
  </div>
  <div role="status" aria-live="polite">
    {#if message}<p class="msg {messageKind}">{message}</p>{/if}
  </div>

  {#if shown.length === 0}
    <p class="muted">{t('history.empty')}</p>
  {:else}
    <ul>
      {#each shown as e (e.id)}
        <li>
          <div class="meta">
            <span class="kind">{kindLabel(e)}</span>
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

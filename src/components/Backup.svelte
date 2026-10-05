<script lang="ts">
  import { downloadBlob } from '../lib/export/download';
  import { formatNumber, t } from '../lib/i18n/index.svelte';
  import {
    backupContents,
    createBackup,
    MAX_BACKUP_BYTES,
    parseBackup,
    restoreBackup,
    type BackupSummary,
    type ParsedBackup,
  } from '../lib/storage/backup';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  let contents: { summary: BackupSummary; secrets: boolean } | null = $state(null);
  let includeSecrets = $state(false);
  // Raw: the parsed data goes to IndexedDB, which cannot clone reactive proxies.
  let parsed: ParsedBackup | null = $state.raw(null);
  let message = $state('');
  let error = $state('');
  let busy = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      contents = null;
      parsed = null;
      message = '';
      error = '';
      void backupContents().then((c) => (contents = c));
    }
    if (!open && dialog.open) dialog.close();
  });

  const counts = (s: BackupSummary) =>
    t('backup.counts', {
      presets: formatNumber(s.presets),
      templates: formatNumber(s.templates),
      history: formatNumber(s.history),
      scanLog: formatNumber(s.scanLog),
    });

  async function save() {
    busy = true;
    try {
      const json = await createBackup(includeSecrets);
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      downloadBlob(new Blob([json], { type: 'application/json' }), `qr-studio-backup-${day}.json`);
      message = t('backup.saved');
    } catch {
      error = t('backup.saveFailed');
    } finally {
      busy = false;
    }
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    parsed = null;
    error = '';
    message = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      error = t('backup.tooLarge', { mb: MAX_BACKUP_BYTES / 1024 / 1024 });
      return;
    }
    parsed = parseBackup(await file.text());
    if (!parsed) error = t('backup.invalid');
  }

  async function restore() {
    if (!parsed || !confirm(t('backup.confirm'))) return;
    busy = true;
    try {
      await restoreBackup(parsed);
      // New settings take effect on the next load.
      location.reload();
    } catch {
      error = t('backup.restoreFailed');
      busy = false;
    }
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="backup-heading">
  <div class="stack">
    <h2 id="backup-heading">{t('backup.title')}</h2>
    <p class="muted">{t('backup.hint')}</p>

    <section class="stack" aria-labelledby="backup-save-heading">
      <h3 id="backup-save-heading">{t('backup.saveTitle')}</h3>
      {#if contents}
        <p>{counts(contents.summary)}</p>
        {#if contents.secrets}
          <p class="msg warn">{t('backup.secretsWarning')}</p>
          <label class="check">
            <input type="checkbox" bind:checked={includeSecrets} />
            {t('backup.includeSecrets')}
          </label>
        {/if}
      {/if}
      <div class="row">
        <button type="button" class="btn primary" disabled={busy} onclick={save}>{t('backup.save')}</button>
      </div>
    </section>

    <section class="stack" aria-labelledby="backup-restore-heading">
      <h3 id="backup-restore-heading">{t('backup.restoreTitle')}</h3>
      <label class="btn small file">
        {t('backup.choose')}
        <input type="file" accept=".json,application/json" class="sr-only" onchange={onFile} />
      </label>
      {#if parsed}
        <p>{counts(parsed.summary)}</p>
        <p class="muted">{t('backup.restoreHint')}</p>
        <div class="row">
          <button type="button" class="btn primary" disabled={busy} onclick={restore}>{t('backup.restore')}</button>
        </div>
      {/if}
    </section>

    <div role="status" aria-live="polite">
      {#if message}<p class="msg ok">{message}</p>{/if}
      {#if error}<p class="msg error">{error}</p>{/if}
    </div>
    <form method="dialog"><button class="btn">{t('app.close')}</button></form>
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    width: min(520px, calc(100vw - 32px));
    padding: 20px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  p {
    margin: 0;
  }
  section {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .file {
    align-self: start;
  }
</style>

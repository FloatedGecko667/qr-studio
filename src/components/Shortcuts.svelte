<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';

  let { open = $bindable(false), mac }: { open?: boolean; mac: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const alt = $derived(mac ? '⌥⇧' : 'Alt+Shift+');
  const rows = $derived([
    [mac ? '⌘S' : 'Ctrl+S', t('shortcuts.save')],
    [`${alt}C`, t('shortcuts.copy')],
    [`${alt}P`, t('shortcuts.print')],
    [mac ? '⌘Z' : 'Ctrl+Z', t('undo.undo')],
    [mac ? '⇧⌘Z' : 'Ctrl+Y', t('undo.redo')],
    [`${alt}1–4`, t('shortcuts.tabs')],
    [`${alt}Q / B / D`, t('shortcuts.modes')],
    [`${alt}/`, t('shortcuts.list')],
  ]);
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="shortcuts-heading">
  <div class="stack">
    <h2 id="shortcuts-heading">{t('shortcuts.title')}</h2>
    <table>
      <tbody>
        {#each rows as [keys, label] (keys)}
          <tr><th scope="row"><kbd>{keys}</kbd></th><td>{label}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="muted">{t('shortcuts.note')}</p>
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
    max-height: calc(100dvh - 48px);
    padding: 20px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-weight: normal;
  }
  th {
    white-space: nowrap;
    width: 1%;
  }
  kbd {
    font-family: inherit;
    font-size: 13px;
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-2);
  }
  p {
    margin: 0;
    font-size: 12px;
  }
</style>

<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  /** Topics in reading order; each has a title and a body (help.<id>.title / help.<id>.body). */
  const TOPICS = ['size', 'logo', 'ecLevel', 'jan', 'unreadable', 'dynamic', 'privacy', 'offline'] as const;
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="help-heading">
  <div class="stack">
    <h2 id="help-heading">{t('help.title')}</h2>
    {#each TOPICS as id (id)}
      <details>
        <summary>{t(`help.${id}.title`)}</summary>
        <p>{t(`help.${id}.body`)}</p>
      </details>
    {/each}
    <form method="dialog"><button class="btn">{t('app.close')}</button></form>
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100dvh - 48px);
    padding: 20px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  details {
    border-bottom: 1px solid var(--border);
    padding: 8px 0;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  p {
    margin: 8px 0 0;
    line-height: 1.7;
    white-space: pre-line;
  }
</style>

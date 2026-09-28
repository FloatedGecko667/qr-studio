<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const LIBS = [
    { name: 'Svelte', license: 'MIT', url: 'https://github.com/sveltejs/svelte' },
    { name: 'zxing-wasm', license: 'MIT', url: 'https://github.com/Sec-ant/zxing-wasm' },
    { name: 'zxing-cpp', license: 'Apache-2.0', url: 'https://github.com/zxing-cpp/zxing-cpp' },
    { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
    { name: 'idb-keyval', license: 'Apache-2.0', url: 'https://github.com/jakearchibald/idb-keyval' },
    { name: 'Workbox', license: 'MIT', url: 'https://github.com/GoogleChrome/workbox' },
    { name: 'JetBrains Mono', license: 'SIL Open Font License 1.1', url: 'https://github.com/JetBrains/JetBrainsMono' },
  ];
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="licenses-heading">
  <div class="stack">
    <h2 id="licenses-heading">{t('licenses.title')}</h2>
    <p>{t('licenses.app')}</p>
    <h3>{t('licenses.thirdParty')}</h3>
    <ul>
      {#each LIBS as lib (lib.name)}
        <li><a href={lib.url} target="_blank" rel="noopener noreferrer">{lib.name}</a> — {lib.license}</li>
      {/each}
    </ul>
    <p class="muted">{t('app.trademark')}</p>
    <form method="dialog"><button class="btn">{t('app.close')}</button></form>
  </div>
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    max-width: min(520px, calc(100vw - 32px));
    padding: 20px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  p {
    margin: 0;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  a {
    color: var(--accent);
  }
</style>

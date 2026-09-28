<script lang="ts">
  import Batch from './components/Batch.svelte';
  import CapacityTable from './components/CapacityTable.svelte';
  import ContentForm from './components/ContentForm.svelte';
  import History from './components/History.svelte';
  import Licenses from './components/Licenses.svelte';
  import Preview from './components/Preview.svelte';
  import Scanner from './components/Scanner.svelte';
  import StyleOptions from './components/StyleOptions.svelte';
  import SymbolOptions from './components/SymbolOptions.svelte';
  import UpdatePrompt from './components/UpdatePrompt.svelte';
  import { app } from './lib/app.svelte';
  import { t } from './lib/i18n/index.svelte';
  import type { Locale, Mode, Theme } from './lib/settings';
  import { applyTheme } from './lib/theme';

  type Tab = 'generate' | 'batch' | 'scan' | 'history';
  const TABS: Record<Mode, Tab[]> = {
    qr: ['generate', 'batch', 'scan', 'history'],
    barcode: ['generate', 'batch', 'scan'],
  };
  let tab: Tab = $state('generate');
  let licensesOpen = $state(false);
  let ribbonHeight = $state(0);
  const mode = $derived(app.settings.mode);
  const tabs = $derived(TABS[mode]);

  // Sticky columns and scroll-into-view offsets need the fixed ribbon's height.
  $effect(() => {
    document.documentElement.style.setProperty('--ribbon-h', `${ribbonHeight}px`);
  });

  $effect(() => applyTheme(app.settings.theme));
  $effect(() => {
    document.documentElement.lang = app.settings.locale;
  });

  function setTheme(theme: Theme) {
    app.settings.theme = theme;
    app.persist();
  }

  function setLocale(locale: Locale) {
    app.settings.locale = locale;
    app.persist();
  }

  let barcodeUi: Promise<typeof import('./components/barcode')> | null = null;
  const loadBarcodeUi = () =>
    (barcodeUi ??= import('./components/barcode').catch((e) => {
      // Allow a retry on the next switch instead of caching the failure.
      barcodeUi = null;
      throw e;
    }));

  function setMode(next: Mode) {
    app.settings.mode = next;
    app.persist();
    if (!TABS[next].includes(tab)) tab = 'generate';
  }
</script>

<div class="ribbon" bind:clientHeight={ribbonHeight}>
  <header>
    <div class="brand">
      <svg viewBox="0 0 7 7" aria-hidden="true" class="logo"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" fill="currentColor" /></svg>
      <div>
        <h1>{t('app.title')}</h1>
        <p class="muted tagline">{t('app.tagline')}</p>
      </div>
    </div>
    <div class="row controls">
      <label class="field inline">
        <span>{t('theme.label')}</span>
        <select value={app.settings.theme} onchange={(e) => setTheme(e.currentTarget.value as Theme)}>
          <option value="system">{t('theme.system')}</option>
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
        </select>
      </label>
      <label class="field inline">
        <span>{t('locale.label')}</span>
        <select value={app.settings.locale} onchange={(e) => setLocale(e.currentTarget.value as Locale)}>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  </header>

  <nav aria-label={t('app.title')}>
    <div class="modes" role="group" aria-label={t('mode.label')}>
      {#each ['qr', 'barcode'] as const as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => setMode(m)}>
          {#if m === 'qr'}
            <svg viewBox="0 0 7 7" aria-hidden="true"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM5 5h2v2H5z" fill="currentColor" /></svg>
          {:else}
            <svg viewBox="0 0 9 7" aria-hidden="true"><path d="M0 0h1v7H0zM2 0h.5v7H2zM3.5 0h1.5v7H3.5zM6 0h.5v7H6zM7.5 0h1.5v7H7.5z" fill="currentColor" /></svg>
          {/if}
          {t(`mode.${m}`)}
        </button>
      {/each}
    </div>
    <div class="tabs">
      {#each tabs as id (id)}
        <button type="button" aria-current={tab === id ? 'page' : undefined} class:active={tab === id} onclick={() => (tab = id)}>
          {t(`tab.${id}`)}
        </button>
      {/each}
    </div>
  </nav>
</div>

<main>
  {#if mode === 'barcode' && tab !== 'scan'}
    {#await loadBarcodeUi()}
      <p class="muted loading">…</p>
    {:then ui}
      {#if tab === 'batch'}
        <div class="narrow"><ui.BarcodeBatch /></div>
      {:else}
        <div class="layout">
          <div class="col inputs">
            <ui.BarcodeForm />
            <ui.BarcodeStyle />
          </div>
          <div class="col side">
            <div class="preview-slot">
              <ui.BarcodePreview />
            </div>
          </div>
        </div>
      {/if}
    {:catch}
      <p class="msg error">{t('app.loadError')}</p>
    {/await}
  {:else if tab === 'generate'}
    <div class="layout">
      <div class="col inputs">
        <ContentForm />
        <SymbolOptions />
        <StyleOptions />
      </div>
      <div class="col side">
        <div class="preview-slot">
          <Preview />
        </div>
        <CapacityTable />
      </div>
    </div>
  {:else if tab === 'batch'}
    <div class="narrow"><Batch /></div>
  {:else if tab === 'scan'}
    <div class="narrow"><Scanner /></div>
  {:else}
    <div class="narrow"><History onRestore={() => (tab = 'generate')} /></div>
  {/if}
</main>

<footer>
  <p>{t('app.privacy')}</p>
  <p>{t('app.trademark')}</p>
  <button type="button" class="link" onclick={() => (licensesOpen = true)}>{t('app.licenses')}</button>
</footer>

<Licenses bind:open={licensesOpen} />
<UpdatePrompt />

<style>
  /* The ribbon (title, controls and tabs) stays at the top while the page scrolls. */
  .ribbon {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding-top: env(safe-area-inset-top);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px max(16px, env(safe-area-inset-left)) 6px;
    max-width: 1280px;
    margin: 0 auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand p {
    margin: 0;
  }
  .logo {
    width: 32px;
    height: 32px;
    color: var(--accent);
  }
  h1 {
    font-size: 20px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inline select {
    width: auto;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .modes {
    display: inline-flex;
    flex: none;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .modes button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 7px;
    background: none;
    padding: 5px 12px;
    min-height: 32px;
    cursor: pointer;
    color: var(--text-2);
    white-space: nowrap;
  }
  .modes svg {
    width: 14px;
    height: 14px;
  }
  .modes button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
  .tabs {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .tabs button {
    border: 0;
    background: none;
    padding: 12px 12px 10px;
    cursor: pointer;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .tabs button.active {
    color: var(--text);
    font-weight: 700;
    border-bottom-color: var(--accent);
  }
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 16px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .col {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  /* Desktop: the whole right column stays in view and scrolls on its own, so the capacity
     table can never slide underneath the preview. */
  .side {
    position: sticky;
    top: calc(var(--ribbon-h, 0px) + 12px);
    max-height: calc(100vh - var(--ribbon-h, 0px) - 24px);
    max-height: calc(100dvh - var(--ribbon-h, 0px) - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    align-content: start;
  }
  .loading {
    text-align: center;
  }
  .narrow {
    max-width: 760px;
    margin: 0 auto;
  }
  footer {
    max-width: 1280px;
    margin: 0 auto;
    padding: 16px 16px 32px;
    color: var(--text-2);
    font-size: 12px;
    display: grid;
    gap: 4px;
  }
  footer p {
    margin: 0;
  }
  .link {
    justify-self: start;
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
    font-size: 12px;
  }

  /* Phones: two compact rows (title + settings, then mode + tabs). */
  @media (max-width: 600px) {
    header {
      flex-wrap: nowrap;
      padding: 8px 12px 4px;
    }
    .brand {
      flex: none;
      gap: 8px;
    }
    .tagline,
    .controls .inline > span {
      display: none;
    }
    h1 {
      font-size: 16px;
    }
    .logo {
      width: 24px;
      height: 24px;
    }
    .controls {
      flex-wrap: nowrap;
      gap: 6px;
      min-width: 0;
    }
    .inline select {
      min-height: 32px;
      max-width: 34vw;
      padding: 4px 6px;
      font-size: 13px;
      text-overflow: ellipsis;
    }
    nav {
      gap: 8px;
      padding: 0 12px;
    }
    .modes svg {
      display: none;
    }
    .modes button {
      padding: 4px 9px;
      font-size: 13px;
    }
    .tabs button {
      padding: 11px 7px 9px;
      font-size: 13px;
    }
  }

  /* Phones: preview first, then inputs, then the capacity table. The preview card is taller
     than a phone screen, so it scrolls normally instead of sticking. */
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      display: contents;
    }
    .preview-slot {
      order: -1;
    }
    .inputs {
      order: 0;
    }
    .side > :global(section) {
      order: 1;
    }
  }
</style>

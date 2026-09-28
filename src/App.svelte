<script lang="ts">
  import Batch from './components/Batch.svelte';
  import CapacityTable from './components/CapacityTable.svelte';
  import ContentForm from './components/ContentForm.svelte';
  import History from './components/History.svelte';
  import Licenses from './components/Licenses.svelte';
  import Preview from './components/Preview.svelte';
  import StyleOptions from './components/StyleOptions.svelte';
  import SymbolOptions from './components/SymbolOptions.svelte';
  import UpdatePrompt from './components/UpdatePrompt.svelte';
  import { app } from './lib/app.svelte';
  import { t } from './lib/i18n/index.svelte';
  import type { Locale, Theme } from './lib/settings';
  import { applyTheme } from './lib/theme';

  type Tab = 'generate' | 'batch' | 'history';
  let tab: Tab = $state('generate');
  let licensesOpen = $state(false);

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

  const TABS: Tab[] = ['generate', 'batch', 'history'];
</script>

<header>
  <div class="brand">
    <svg viewBox="0 0 7 7" aria-hidden="true" class="logo"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" fill="currentColor" /></svg>
    <div>
      <h1>{t('app.title')}</h1>
      <p class="muted">{t('app.tagline')}</p>
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
  {#each TABS as id (id)}
    <button type="button" aria-current={tab === id ? 'page' : undefined} class:active={tab === id} onclick={() => (tab = id)}>
      {t(`tab.${id}`)}
    </button>
  {/each}
</nav>

<main>
  {#if tab === 'generate'}
    <div class="layout">
      <div class="col inputs">
        <ContentForm />
        <SymbolOptions />
        <StyleOptions />
      </div>
      <div class="col side">
        <div class="sticky">
          <Preview />
        </div>
        <CapacityTable />
      </div>
    </div>
  {:else if tab === 'batch'}
    <div class="narrow"><Batch /></div>
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
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px max(16px, env(safe-area-inset-left)) 8px;
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
    gap: 4px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
  }
  nav button {
    border: 0;
    background: none;
    padding: 10px 14px;
    cursor: pointer;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  nav button.active {
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
  .sticky {
    position: sticky;
    top: 12px;
    z-index: 2;
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

  /* Phones: preview first, then inputs, then the capacity table. The preview card is taller
     than a phone screen, so it scrolls normally instead of sticking. */
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      display: contents;
    }
    .sticky {
      order: -1;
      position: static;
    }
    .inputs {
      order: 0;
    }
    .side > :global(section) {
      order: 1;
    }
  }
</style>

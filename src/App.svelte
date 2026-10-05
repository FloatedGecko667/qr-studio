<script lang="ts">
  import CapacityTable from './components/CapacityTable.svelte';
  import DistanceSize from './components/DistanceSize.svelte';
  import ContentForm from './components/ContentForm.svelte';
  import Licenses from './components/Licenses.svelte';
  import Preview from './components/Preview.svelte';
  import PreviewDock from './components/PreviewDock.svelte';
  import StyleOptions from './components/StyleOptions.svelte';
  import SymbolOptions from './components/SymbolOptions.svelte';
  import UpdatePrompt from './components/UpdatePrompt.svelte';
  import { app } from './lib/app.svelte';
  import { loadLocale, t } from './lib/i18n/index.svelte';
  import { LOCALES, LOCALE_NAMES, MODES, type Locale, type Mode, type Theme, type View } from './lib/settings';
  import { applyTheme } from './lib/theme';
  import { clearLaunchParams, launchTarget, type Tab } from './lib/launch';
  import { lazy } from './lib/ui/lazy';
  import { isMac, isTextEntry, shortcutAction, undoAction, type Shortcut } from './lib/ui/keys';
  import { undoTargets } from './lib/undoTargets.svelte';
  import { consumeLaunchedFiles } from './lib/launchFiles.svelte';
  import { stickySidebar } from './lib/ui/stickySidebar';

  const TABS: Record<Mode, Tab[]> = {
    qr: ['generate', 'batch', 'scan', 'history'],
    barcode: ['generate', 'batch', 'scan', 'history'],
    datamatrix: ['generate', 'batch', 'scan', 'history'],
  };
  // App shortcuts open a given screen (?mode=…&tab=…); the parameters are then removed.
  const launch = launchTarget(location.search);
  if (launch.mode && launch.mode !== app.settings.mode) {
    app.settings.mode = launch.mode;
    app.persist();
  }
  clearLaunchParams();
  // Images from the share target are read once, by the first scan tab that mounts.
  let pendingShare = launch.shared;
  const sharedOnce = () => {
    const s = pendingShare;
    pendingShare = undefined;
    return s;
  };
  let tab: Tab = $state(launch.tab ?? 'generate');
  consumeLaunchedFiles(() => (tab = 'batch'));
  let licensesOpen = $state(false);
  let backupOpen = $state(false);
  let helpOpen = $state(false);
  let shortcutsOpen = $state(false);
  /** Feedback goes to GitHub Issues; nothing is sent from the app itself. */
  const FEEDBACK_URL = 'https://github.com/FloatedGecko667/qr-studio/issues/new';
  let ribbonHeight = $state(0);
  let settingsOpen = $state(false);
  let settingsEl: HTMLDetailsElement | undefined = $state();
  let previewEl: HTMLElement | undefined = $state();

  // Close the settings menu on an outside click or Escape.
  function onWindowPointer(e: PointerEvent) {
    if (settingsOpen && settingsEl && !settingsEl.contains(e.target as Node)) settingsOpen = false;
  }
  const mac = typeof navigator !== 'undefined' && isMac(navigator.platform);

  function onWindowKey(e: KeyboardEvent) {
    if (settingsOpen && e.key === 'Escape') {
      settingsOpen = false;
      settingsEl?.querySelector('summary')?.focus();
    }
    if (e.defaultPrevented) return;
    const typing = isTextEntry(document.activeElement);
    const shortcut = shortcutAction(e, mac, typing);
    if (shortcut && runShortcut(shortcut)) {
      e.preventDefault();
      return;
    }
    const action = tab === 'generate' && !typing ? undoAction(e, mac) : null;
    if (action && undoTarget) {
      e.preventDefault();
      undoTarget[action]();
    }
  }

  /** Runs a shortcut; false when it does not apply here (the browser then handles the key). */
  function runShortcut(s: Shortcut): boolean {
    if (s.type === 'help') {
      shortcutsOpen = true;
      return true;
    }
    if (s.type === 'tab') {
      const next = tabs[s.index];
      if (next) tab = next;
      return !!next;
    }
    if (s.type === 'mode') {
      setMode(s.mode);
      return true;
    }
    // Save, copy and print press the preview's own button, so they behave exactly the same.
    const button = tab === 'generate' ? document.querySelector<HTMLButtonElement>(`[data-shortcut="${s.type}"]`) : null;
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }
  const mode = $derived(app.settings.mode);
  const undoTarget = $derived(undoTargets[mode]);
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
    // Saved at once; the text switches when the dictionary has arrived (the old one shows until then).
    app.settings.locale = locale;
    app.persist();
    void loadLocale(locale);
  }

  // Screens other than the QR generator load on first use to keep the initial bundle small.
  const loadBarcodeUi = lazy(() => import('./components/barcode'));
  const loadBatch = lazy(() => import('./components/Batch.svelte'));
  const loadScanner = lazy(() => import('./components/Scanner.svelte'));
  const loadBackup = lazy(() => import('./components/Backup.svelte'));
  const loadHelp = lazy(() => import('./components/Help.svelte'));
  const loadShortcuts = lazy(() => import('./components/Shortcuts.svelte'));
  const loadHistory = lazy(() => import('./components/History.svelte'));

  const simple = $derived(app.settings.view === 'simple');

  function setView(view: View) {
    app.settings.view = view;
    app.persist();
  }

  function setMode(next: Mode) {
    app.settings.mode = next;
    app.persist();
    if (!TABS[next].includes(tab)) tab = 'generate';
  }
</script>

<svelte:window onpointerdown={onWindowPointer} onkeydown={onWindowKey} />

<div class="ribbon" bind:clientHeight={ribbonHeight}>
  <header>
    <div class="brand">
      <svg viewBox="0 0 7 7" aria-hidden="true" class="logo"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z" fill="currentColor" /></svg>
      <div class="titles">
        <h1>{t('app.title')}</h1>
        <p class="muted tagline">{t('app.tagline')}</p>
      </div>
    </div>

    <div class="modes" role="group" aria-label={t('mode.label')}>
      {#each MODES as m (m)}
        <button type="button" aria-pressed={mode === m} onclick={() => setMode(m)}>
          {#if m === 'qr'}
            <svg viewBox="0 0 7 7" aria-hidden="true"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM5 5h2v2H5z" fill="currentColor" /></svg>
          {:else if m === 'barcode'}
            <svg viewBox="0 0 9 7" aria-hidden="true"><path d="M0 0h1v7H0zM2 0h.5v7H2zM3.5 0h1.5v7H3.5zM6 0h.5v7H6zM7.5 0h1.5v7H7.5z" fill="currentColor" /></svg>
          {:else}
            <svg viewBox="0 0 7 7" aria-hidden="true"><path d="M0 0h1v7H0zM0 6h7v1H0zM2 0h1v1H2zM4 0h1v1H4zM6 0h1v1H6zM6 2h1v1H6zM6 4h1v1H6zM2 2h2v2H2zM4 4h1v1H4z" fill="currentColor" /></svg>
          {/if}
          <span>{t(`mode.${m}`)}</span>
        </button>
      {/each}
    </div>

    <details class="settings" bind:open={settingsOpen} bind:this={settingsEl}>
      <summary aria-label={t('settings.label')} title={t('settings.label')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            fill="currentColor"
            d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" /></svg
        >
      </summary>
      <div class="menu stack">
        <label class="field">
          <span>{t('theme.label')}</span>
          <select value={app.settings.theme} onchange={(e) => setTheme(e.currentTarget.value as Theme)}>
            <option value="system">{t('theme.system')}</option>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('locale.label')}</span>
          <select value={app.settings.locale} onchange={(e) => setLocale(e.currentTarget.value as Locale)}>
            {#each LOCALES as l (l)}
              <option value={l} lang={l}>{LOCALE_NAMES[l]}</option>
            {/each}
          </select>
        </label>
        <button type="button" class="btn small" onclick={() => ((backupOpen = true), (settingsOpen = false))}>{t('backup.open')}</button>
      </div>
    </details>
  </header>

  <nav aria-label={t(`mode.${mode}`)}>
    <div class="tabs">
      {#each tabs as id (id)}
        <button type="button" aria-current={tab === id ? 'page' : undefined} class:active={tab === id} onclick={() => (tab = id)}>
          {t(`tab.${id}`)}
        </button>
      {/each}
    </div>
  </nav>
</div>

{#snippet viewBar()}
  <div class="view-bar">
    <div class="segmented" role="group" aria-label={t('view.label')}>
      <button type="button" aria-pressed={simple} onclick={() => setView('simple')}>{t('view.simple')}</button>
      <button type="button" aria-pressed={!simple} onclick={() => setView('detailed')}>{t('view.detailed')}</button>
    </div>
    <div class="undo" role="group" aria-label={t('undo.label')}>
      <button
        type="button"
        class="btn small icon"
        disabled={!undoTarget?.canUndo}
        onclick={() => undoTarget?.undo()}
        aria-label={t('undo.undo')}
        title={`${t('undo.undo')} (${mac ? '⌘Z' : 'Ctrl+Z'})`}
        aria-keyshortcuts={mac ? 'Meta+Z' : 'Control+Z'}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62A7.95 7.95 0 0 1 12.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78A10.5 10.5 0 0 0 12.5 8z" /></svg></button
      >
      <button
        type="button"
        class="btn small icon"
        disabled={!undoTarget?.canRedo}
        onclick={() => undoTarget?.redo()}
        aria-label={t('undo.redo')}
        title={`${t('undo.redo')} (${mac ? '⇧⌘Z' : 'Ctrl+Y'})`}
        aria-keyshortcuts={mac ? 'Shift+Meta+Z' : 'Control+Y'}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.4 10.6A10.46 10.46 0 0 0 11.5 8c-4.65 0-8.58 3.03-9.96 7.22l2.36.78a8 8 0 0 1 7.6-5.5c1.95 0 3.73.72 5.12 1.88L13 16h9V7z" /></svg></button
      >
    </div>
    <p class="muted">{t(simple ? 'view.simpleHint' : 'view.detailedHint')}</p>
  </div>
{/snippet}

<main>
  <p class="trust">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z" /></svg>
    {t('app.trust')}
  </p>
  {#if mode !== 'qr' && (tab === 'generate' || tab === 'batch')}
    {#await loadBarcodeUi()}
      <p class="muted loading">…</p>
    {:then ui}
      {@const code = mode === 'datamatrix' ? ui.matrixCode : ui.barcode}
      {#key mode}
        {#if tab === 'batch'}
          <div class="narrow"><ui.BarcodeBatch {code} /></div>
        {:else}
          {@render viewBar()}
          <div class="layout" class:with-capacity={!simple} class:simple>
            <div class="col inputs">
              <ui.BarcodeForm {code} />
              {#if !simple}<ui.BarcodeStyle {code} />{/if}
            </div>
            <div class="preview-slot" use:stickySidebar bind:this={previewEl}>
              <ui.BarcodePreview {code} />
            </div>
            {#if !simple}
              <div class="capacity-slot" use:stickySidebar>
                {#if mode === 'datamatrix'}<ui.MatrixCapacity {code} />{:else}<ui.PrintWidth {code} />{/if}
              </div>
            {/if}
          </div>
        {/if}
      {/key}
    {:catch}
      <p class="msg error">{t('app.loadError')}</p>
    {/await}
  {:else if tab === 'generate'}
    {@render viewBar()}
    <div class="layout" class:with-capacity={!simple} class:simple>
      <div class="col inputs">
        <ContentForm />
        {#if !simple}
          <SymbolOptions />
          <StyleOptions />
        {/if}
      </div>
      <div class="preview-slot" use:stickySidebar bind:this={previewEl}>
        <Preview />
      </div>
      {#if !simple}
        <div class="capacity-slot col" use:stickySidebar>
          <CapacityTable />
          <DistanceSize />
        </div>
      {/if}
    </div>
  {:else if tab === 'batch'}
    {#await loadBatch()}
      <p class="muted loading">…</p>
    {:then { default: Batch }}
      <div class="narrow"><Batch /></div>
    {:catch}
      <p class="msg error">{t('app.loadError')}</p>
    {/await}
  {:else if tab === 'scan'}
    {#await loadScanner()}
      <p class="muted loading">…</p>
    {:then { default: Scanner }}
      <div class="narrow stack"><Scanner shared={sharedOnce()} /></div>
    {:catch}
      <p class="msg error">{t('app.loadError')}</p>
    {/await}
  {:else}
    {#await loadHistory()}
      <p class="muted loading">…</p>
    {:then { default: History }}
      {#key mode}
        <div class="narrow"><History
          {mode}
          onRestore={(m) => {
            setMode(m);
            tab = 'generate';
          }} /></div>
      {/key}
    {:catch}
      <p class="msg error">{t('app.loadError')}</p>
    {/await}
  {/if}
</main>

<footer>
  <p>{t('app.privacy')}</p>
  <p>{t('app.trademark')}</p>
  <div class="footer-links">
    <button type="button" class="link" onclick={() => (helpOpen = true)}>{t('help.open')}</button>
    <button type="button" class="link" onclick={() => (shortcutsOpen = true)}>{t('shortcuts.open')}</button>
    <a class="link" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">{t('app.feedback')}</a>
    <button type="button" class="link" onclick={() => (licensesOpen = true)}>{t('app.licenses')}</button>
  </div>
</footer>

{#if tab === 'generate'}<PreviewDock anchor={previewEl} />{/if}

<Licenses bind:open={licensesOpen} />
{#if shortcutsOpen}
  {#await loadShortcuts() then { default: Shortcuts }}<Shortcuts bind:open={shortcutsOpen} {mac} />{/await}
{/if}
{#if helpOpen}
  {#await loadHelp() then { default: Help }}<Help bind:open={helpOpen} />{/await}
{/if}
{#if backupOpen}
  {#await loadBackup() then { default: Backup }}<Backup bind:open={backupOpen} />{/await}
{/if}
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
    align-items: center;
    gap: 8px 16px;
    padding: 8px max(16px, env(safe-area-inset-left)) 4px;
    max-width: var(--page-w);
    margin: 0 auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .brand p {
    margin: 0;
  }
  .logo {
    width: 30px;
    height: 30px;
    color: var(--accent);
  }
  h1 {
    font-size: 19px;
  }
  .modes {
    display: inline-flex;
    flex: none;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    margin-left: auto;
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
    flex: none;
  }
  .modes button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }
  .settings {
    position: relative;
    flex: none;
  }
  .settings summary {
    list-style: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
    cursor: pointer;
  }
  .settings summary::-webkit-details-marker {
    display: none;
  }
  .settings summary svg {
    width: 20px;
    height: 20px;
  }
  .settings[open] summary {
    color: var(--accent);
    border-color: var(--accent);
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    width: 220px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    z-index: 1;
  }
  nav {
    max-width: var(--page-w);
    margin: 0 auto;
    padding: 0 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs {
    display: flex;
    gap: 2px;
  }
  .tabs button {
    border: 0;
    background: none;
    padding: 10px 12px 8px;
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
    max-width: var(--page-w);
    margin: 0 auto;
    padding: 16px;
  }
  /* Generate tab, shared by all three modes. One page scroll moves everything: the preview
     (and on wide screens the capacity table) follows in its own column via stickySidebar,
     never with a scrollbar of its own. Columns: tablet/desktop inputs | preview, with the
     capacity table under the inputs; wide screens get a third column for it. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas: 'inputs preview';
    gap: 16px;
    align-items: start;
  }
  .layout.with-capacity {
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'inputs preview'
      'capacity preview';
  }
  .col {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .inputs {
    grid-area: inputs;
  }
  .preview-slot {
    grid-area: preview;
    position: sticky;
    min-width: 0;
  }
  .capacity-slot {
    grid-area: capacity;
    min-width: 0;
  }
  @media (min-width: 1440px) {
    .layout.with-capacity {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 0.9fr);
      grid-template-rows: auto;
      grid-template-areas: 'inputs preview capacity';
    }
    .capacity-slot {
      position: sticky;
    }
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0 16px;
  }
  /* 24px tall targets: long translations wrap onto several lines (WCAG 2.5.8). */
  .footer-links .link {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
  a.link {
    font-size: 12px;
    color: var(--accent);
  }
  .trust {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ok);
  }
  .trust svg {
    flex: none;
    width: 16px;
    height: 16px;
  }
  .view-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-bottom: 12px;
  }
  .view-bar p {
    margin: 0;
    font-size: 12px;
  }
  .undo {
    display: flex;
    gap: 4px;
  }
  .btn.icon {
    min-width: 32px;
    min-height: 32px;
    padding: 4px;
    justify-content: center;
  }
  .btn.icon svg {
    width: 18px;
    height: 18px;
  }
  /* Simple view: two columns, no capacity table; narrower so the code stays large and close. */
  .layout.simple {
    max-width: 1080px;
    margin-inline: auto;
  }
  .loading {
    text-align: center;
  }
  .narrow {
    max-width: 760px;
    margin: 0 auto;
  }
  footer {
    max-width: var(--page-w);
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

  @media (max-width: 760px) {
    .tagline {
      display: none;
    }
  }

  /* Phones: two compact rows (logo, mode tabs and settings; then the tabs). */
  @media (max-width: 600px) {
    header {
      gap: 8px;
      padding: 8px 12px 2px;
    }
    .titles {
      display: none;
    }
    .logo {
      width: 26px;
      height: 26px;
    }
    .modes {
      flex: 1;
      min-width: 0;
      margin-left: 0;
    }
    .modes button {
      flex: 1 1 auto;
      justify-content: center;
      min-width: 0;
      padding: 4px 6px;
      font-size: 13px;
    }
    .modes button span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .modes svg {
      display: none;
    }
    nav {
      padding: 0 12px;
    }
    .tabs button {
      flex: 1;
      padding: 10px 6px 8px;
      font-size: 13px;
    }
    .tabs {
      width: 100%;
    }
  }

  /* Phones and portrait tablets: one column with the preview first. It scrolls with the page;
     PreviewDock shows a compact copy under the ribbon once it has scrolled away. */
  @media (max-width: 860px) {
    .layout,
    .layout.with-capacity {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
      grid-template-areas: 'preview' 'inputs' 'capacity';
    }
    .preview-slot {
      position: static;
    }
  }
</style>

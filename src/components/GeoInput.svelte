<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { formatCoord, searchPlaces, type GeoProvider, type Place, type SearchError } from '../lib/geo/search';
  import { t } from '../lib/i18n/index.svelte';
  import GeoMap from './GeoMap.svelte';

  const values = $derived(app.fields.geo);
  const provider = $derived(app.settings.geoProvider);
  const lat = $derived(parseCoord(values.lat, 90));
  const lng = $derived(parseCoord(values.lng, 180));

  let query = $state('');
  let searching = $state(false);
  let results: Place[] = $state([]);
  let searchError: SearchError | null = $state(null);
  let mapOpen = $state(false);
  let locating = $state(false);
  let locateMessage = $state('');
  let locateKind: 'ok' | 'error' = $state('ok');

  function parseCoord(v: unknown, limit: number): number | null {
    if (typeof v !== 'string' || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
  }

  function setPoint(la: number, ln: number, label?: string) {
    app.setField('lat', formatCoord(la));
    app.setField('lng', formatCoord(ln));
    if (label !== undefined) app.setField('label', label);
  }

  function setProvider(p: GeoProvider) {
    app.settings.geoProvider = p;
    app.persist();
    results = [];
    searchError = null;
  }

  async function search(e: SubmitEvent) {
    e.preventDefault();
    searching = true;
    searchError = null;
    results = [];
    const r = await searchPlaces(query, provider, app.settings.locale);
    searching = false;
    if ('error' in r) {
      searchError = r.error;
      return;
    }
    results = r.places;
    if (r.places.length === 1) choose(r.places[0]);
  }

  function choose(p: Place) {
    setPoint(p.lat, p.lng, p.label);
    results = [];
  }

  function locate() {
    locateMessage = '';
    if (!('geolocation' in navigator)) {
      locateKind = 'error';
      locateMessage = t('geo.locateUnsupported');
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        setPoint(pos.coords.latitude, pos.coords.longitude);
        locateKind = 'ok';
        locateMessage = t('geo.locateOk', { m: Math.round(pos.coords.accuracy) });
      },
      (err) => {
        locating = false;
        locateKind = 'error';
        locateMessage = t(err.code === err.PERMISSION_DENIED ? 'geo.locateDenied' : 'geo.locateFailed');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const serviceName = $derived(t(`geo.provider.${provider}`));
</script>

<div class="stack">
  <div class="row">
    <button type="button" class="btn" disabled={locating} onclick={locate}>
      {locating ? t('geo.locating') : t('geo.locate')}
    </button>
    <span class="muted">{t('geo.locateNote')}</span>
  </div>
  <div role="status" aria-live="polite">
    {#if locateMessage}<p class="msg {locateKind}">{locateMessage}</p>{/if}
  </div>

  <fieldset class="stack external">
    <legend>{t('geo.externalTitle')}</legend>
    <div class="field">
      <span class="label" id="geo-provider">{t('geo.providerLabel')}</span>
      <div class="segmented" role="group" aria-labelledby="geo-provider">
        {#each ['gsi', 'osm'] as const as p (p)}
          <button type="button" aria-pressed={provider === p} onclick={() => setProvider(p)}>{t(`geo.provider.${p}`)}</button>
        {/each}
      </div>
    </div>
    <p class="muted">{t('geo.externalNote', { service: serviceName })}</p>

    <form class="row" onsubmit={search}>
      <input
        type="search"
        class="grow"
        maxlength="200"
        enterkeyhint="search"
        placeholder={t(`geo.searchPlaceholder.${provider}`)}
        aria-label={t('geo.search')}
        bind:value={query} />
      <button type="submit" class="btn" disabled={searching || !query.trim()}>{searching ? t('geo.searching') : t('geo.search')}</button>
    </form>
    <div role="status" aria-live="polite">
      {#if searchError}<p class="msg error">{t(`geo.error.${searchError}`)}</p>{/if}
    </div>
    {#if results.length > 1}
      <ul class="results" aria-label={t('geo.results')}>
        {#each results as p, i (i)}
          <li><button type="button" class="link" onclick={() => choose(p)}>{p.detail ?? p.label}</button></li>
        {/each}
      </ul>
    {/if}

    {#if mapOpen}
      <GeoMap {lat} {lng} {provider} onPick={(la, ln) => setPoint(la, ln)} />
      <p class="muted">{t('geo.mapHint')}</p>
      <button type="button" class="btn small" onclick={() => (mapOpen = false)}>{t('geo.hideMap')}</button>
    {:else}
      <button type="button" class="btn small" onclick={() => (mapOpen = true)}>{t('geo.showMap')}</button>
    {/if}
  </fieldset>
</div>

<style>
  p {
    margin: 0;
  }
  .external {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 12px;
  }
  legend {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    padding: 0 4px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  input[type='search'] {
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .results {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
  }
  .link {
    border: 0;
    background: none;
    padding: 4px 0;
    color: var(--accent);
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
  }
  .btn.small {
    justify-self: start;
  }
</style>

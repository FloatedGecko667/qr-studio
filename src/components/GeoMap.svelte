<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type * as Leaflet from 'leaflet';
  import { TILE_LAYERS, type GeoProvider } from '../lib/geo/search';
  import { t } from '../lib/i18n/index.svelte';

  let {
    lat,
    lng,
    provider,
    onPick,
  }: { lat: number | null; lng: number | null; provider: GeoProvider; onPick: (lat: number, lng: number) => void } = $props();

  const JAPAN: [number, number] = [36.2, 138.25];
  let container: HTMLDivElement | undefined = $state();
  let L: typeof Leaflet | null = $state(null);
  let map: Leaflet.Map | null = null;
  let tiles: Leaflet.TileLayer | null = null;
  let marker: Leaflet.Marker | null = null;
  let failed = $state(false);

  onMount(async () => {
    try {
      const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
    } catch {
      failed = true;
      return;
    }
    const hasPoint = lat !== null && lng !== null;
    map = L.map(container!, { zoomControl: true, attributionControl: true }).setView(hasPoint ? [lat!, lng!] : JAPAN, hasPoint ? 15 : 5);
    map.on('click', (e: Leaflet.LeafletMouseEvent) => onPick(e.latlng.lat, e.latlng.lng));
  });

  // Swap tiles when the provider changes.
  $effect(() => {
    const cfg = TILE_LAYERS[provider];
    if (!L || !map) return;
    tiles?.remove();
    tiles = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      attribution: cfg.attribution,
      // Tile servers may require a Referer; send only our origin.
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOrigin: false,
    }).addTo(map);
  });

  // Keep the marker in sync with the coordinate fields.
  $effect(() => {
    if (!L || !map) return;
    if (lat === null || lng === null) {
      marker?.remove();
      marker = null;
      return;
    }
    const pos: [number, number] = [lat, lng];
    if (!marker) {
      const icon = L.divIcon({ className: 'geo-pin', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 24] });
      marker = L.marker(pos, { draggable: true, keyboard: true, icon, title: t('geo.marker') }).addTo(map);
      marker.on('dragend', () => {
        const p = marker!.getLatLng();
        onPick(p.lat, p.lng);
      });
    } else {
      marker.setLatLng(pos);
    }
    if (!map.getBounds().contains(pos)) map.setView(pos, Math.max(map.getZoom(), 13));
  });

  onDestroy(() => {
    map?.remove();
    map = null;
  });
</script>

{#if failed}
  <p class="msg error">{t('geo.mapError')}</p>
{:else}
  <div class="map" bind:this={container} role="application" aria-label={t('geo.mapLabel')}></div>
{/if}

<style>
  .map {
    height: 320px;
    border-radius: 8px;
    border: 1px solid var(--border);
    z-index: 0;
  }
  .map :global(.geo-pin span) {
    display: block;
    width: 24px;
    height: 24px;
    background: var(--accent);
    border: 3px solid #fff;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
  }
  .map :global(.leaflet-control-attribution) {
    font-size: 10px;
  }
</style>

// Place search against external services. Called only on an explicit user action; the
// caller shows which service receives the query.

export type GeoProvider = 'gsi' | 'osm';

export interface Place {
  lat: number;
  lng: number;
  /** Short name used as the geo: label (kept short so the symbol stays small). */
  label: string;
  /** Full address shown in the result list when it differs from the label. */
  detail?: string;
}

export type SearchError = 'notFound' | 'network' | 'invalid';

export const GEO_HOSTS = {
  gsiTiles: 'https://cyberjapandata.gsi.go.jp',
  gsiSearch: 'https://msearch.gsi.go.jp',
  zipcloud: 'https://zipcloud.ibsnet.co.jp',
  osmTiles: 'https://tile.openstreetmap.org',
  nominatim: 'https://nominatim.openstreetmap.org',
} as const;

export const TILE_LAYERS: Record<GeoProvider, { url: string; attribution: string; maxZoom: number }> = {
  gsi: {
    url: `${GEO_HOSTS.gsiTiles}/xyz/std/{z}/{x}/{y}.png`,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',
    maxZoom: 18,
  },
  osm: {
    url: `${GEO_HOSTS.osmTiles}/{z}/{x}/{y}.png`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

const MAX_RESULTS = 5;
const MAX_QUERY = 200;

/** "100-0001", "1000001", "〒100-0001" or full-width digits → "1000001". */
export function japanesePostalCode(query: string): string | null {
  const q = query
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－ー―‐]/g, '-')
    .replace(/^〒\s*/, '')
    .trim();
  const m = /^(\d{3})-?(\d{4})$/.exec(q);
  return m ? m[1] + m[2] : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (lat: number, lng: number) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** GSI address search: GeoJSON-like features with [lng, lat]. */
export function parseGsi(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const out: Place[] = [];
  for (const f of json) {
    const c = f?.geometry?.coordinates;
    const title = f?.properties?.title;
    if (!Array.isArray(c) || !isNum(c[0]) || !isNum(c[1]) || typeof title !== 'string') continue;
    if (!inRange(c[1], c[0])) continue;
    out.push({ lat: c[1], lng: c[0], label: title.slice(0, 100) });
  }
  return out.slice(0, MAX_RESULTS);
}

/** zipcloud: postal code → address strings (prefecture + city + town). */
export function parseZipcloud(json: unknown): string[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map((r) => [r?.address1, r?.address2, r?.address3].filter((s) => typeof s === 'string').join(''))
    .filter((s) => s.length > 0);
}

export function parseNominatim(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const out: Place[] = [];
  for (const r of json) {
    const lat = Number(r?.lat);
    const lng = Number(r?.lon);
    const full = typeof r?.display_name === 'string' ? r.display_name : '';
    const short = typeof r?.name === 'string' && r.name ? r.name : full.split(',')[0].trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inRange(lat, lng) || !short) continue;
    out.push({ lat, lng, label: short.slice(0, 100), ...(full && full !== short ? { detail: full.slice(0, 200) } : {}) });
  }
  return out.slice(0, MAX_RESULTS);
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// Send only our origin as Referer (the OSM usage policies ask for one), never the full URL.
const INIT: RequestInit = { referrerPolicy: 'strict-origin-when-cross-origin', credentials: 'omit' };

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url, INIT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function gsiSearchUrl(q: string): string {
  return `${GEO_HOSTS.gsiSearch}/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
}

async function searchGsi(query: string, fetcher: Fetcher): Promise<Place[]> {
  const zip = japanesePostalCode(query);
  if (!zip) return parseGsi(await getJson(fetcher, gsiSearchUrl(query)));
  const addresses = parseZipcloud(await getJson(fetcher, `${GEO_HOSTS.zipcloud}/api/search?zipcode=${zip}`));
  if (addresses.length === 0) return [];
  const places = parseGsi(await getJson(fetcher, gsiSearchUrl(addresses[0])));
  // Label with the postal code and the full address from zipcloud.
  return places.slice(0, 1).map((p) => ({ ...p, label: `〒${zip.slice(0, 3)}-${zip.slice(3)} ${addresses[0]}` }));
}

async function searchOsm(query: string, fetcher: Fetcher, lang: string): Promise<Place[]> {
  const zip = japanesePostalCode(query);
  const params = new URLSearchParams({ format: 'jsonv2', limit: String(MAX_RESULTS), 'accept-language': lang });
  if (zip) {
    params.set('postalcode', `${zip.slice(0, 3)}-${zip.slice(3)}`);
    params.set('countrycodes', 'jp');
  } else {
    params.set('q', query);
  }
  return parseNominatim(await getJson(fetcher, `${GEO_HOSTS.nominatim}/search?${params}`));
}

export async function searchPlaces(
  query: string,
  provider: GeoProvider,
  lang: string,
  fetcher: Fetcher = fetch,
): Promise<{ places: Place[] } | { error: SearchError }> {
  const q = query.trim().slice(0, MAX_QUERY);
  if (!q) return { error: 'invalid' };
  try {
    const places = provider === 'gsi' ? await searchGsi(q, fetcher) : await searchOsm(q, fetcher, lang);
    return places.length ? { places } : { error: 'notFound' };
  } catch {
    return { error: 'network' };
  }
}

/** geo: URIs do not need more than 6 decimals (~0.1 m); fewer digits keep the symbol small. */
export function formatCoord(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

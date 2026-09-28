import { describe, expect, it } from 'vitest';
import { formatCoord, japanesePostalCode, parseGsi, parseNominatim, parseZipcloud, searchPlaces, type Fetcher } from './search';

const GSI = [{ geometry: { coordinates: [139.753616, 35.69389], type: 'Point' }, type: 'Feature', properties: { addressCode: '', title: '東京都千代田区' } }];
const ZIP = { message: null, results: [{ address1: '東京都', address2: '千代田区', address3: '千代田', zipcode: '1000001' }], status: 200 };
const NOM = [{ lat: '43.0619360', lon: '141.3542924', name: '札幌市', display_name: '札幌市, 石狩振興局, 北海道, 日本' }];

function fakeFetch(routes: Record<string, unknown>): { fetcher: Fetcher; calls: string[]; inits: (RequestInit | undefined)[] } {
  const calls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push(url);
    inits.push(init);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response('', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  };
  return { fetcher, calls, inits };
}

describe('parsers', () => {
  it('parses GSI, zipcloud and Nominatim responses', () => {
    expect(parseGsi(GSI)).toEqual([{ lat: 35.69389, lng: 139.753616, label: '東京都千代田区' }]);
    expect(parseZipcloud(ZIP)).toEqual(['東京都千代田区千代田']);
    expect(parseNominatim(NOM)).toEqual([{ lat: 43.061936, lng: 141.3542924, label: '札幌市', detail: '札幌市, 石狩振興局, 北海道, 日本' }]);
    expect(parseNominatim([{ lat: '1', lon: '2', display_name: 'A, B' }])).toEqual([{ lat: 1, lng: 2, label: 'A', detail: 'A, B' }]);
  });

  it('drops malformed or out-of-range entries', () => {
    expect(parseGsi([{ geometry: { coordinates: [500, 10] }, properties: { title: 'x' } }, null, 'x'])).toEqual([]);
    expect(parseGsi({ not: 'array' })).toEqual([]);
    expect(parseZipcloud({ results: null })).toEqual([]);
    expect(parseNominatim([{ lat: 'abc', lon: '1', display_name: 'x' }])).toEqual([]);
  });
});

describe('japanesePostalCode', () => {
  it('normalizes common spellings', () => {
    expect(japanesePostalCode('100-0001')).toBe('1000001');
    expect(japanesePostalCode('〒１００－０００１')).toBe('1000001');
    expect(japanesePostalCode('1000001')).toBe('1000001');
    expect(japanesePostalCode('札幌市')).toBeNull();
    expect(japanesePostalCode('100-00012')).toBeNull();
  });
});

describe('searchPlaces', () => {
  it('GSI: resolves postal codes via zipcloud then the address search', async () => {
    const { fetcher, calls, inits } = fakeFetch({
      'https://zipcloud.ibsnet.co.jp/api/search?zipcode=1000001': ZIP,
      'https://msearch.gsi.go.jp/address-search/AddressSearch': GSI,
    });
    const r = await searchPlaces('100-0001', 'gsi', 'ja', fetcher);
    expect(r).toEqual({ places: [{ lat: 35.69389, lng: 139.753616, label: '〒100-0001 東京都千代田区千代田' }] });
    expect(calls[1]).toContain(encodeURIComponent('東京都千代田区千代田'));
    expect(inits.every((i) => i?.referrerPolicy === 'strict-origin-when-cross-origin' && i.credentials === 'omit')).toBe(true);
  });

  it('OSM: uses postalcode for Japanese codes and q otherwise', async () => {
    const { fetcher, calls } = fakeFetch({ 'https://nominatim.openstreetmap.org/search': NOM });
    await searchPlaces('〒100-0001', 'osm', 'ja', fetcher);
    await searchPlaces('札幌市', 'osm', 'en', fetcher);
    expect(calls[0]).toContain('postalcode=100-0001');
    expect(calls[0]).toContain('countrycodes=jp');
    expect(calls[1]).toContain(`q=${encodeURIComponent('札幌市')}`);
    expect(calls[1]).toContain('accept-language=en');
  });

  it('reports not found, network errors and empty input', async () => {
    expect(await searchPlaces('nowhere', 'gsi', 'ja', fakeFetch({ 'https://msearch.gsi.go.jp': [] }).fetcher)).toEqual({ error: 'notFound' });
    expect(await searchPlaces('x', 'osm', 'ja', fakeFetch({}).fetcher)).toEqual({ error: 'network' });
    const failing: Fetcher = () => Promise.reject(new TypeError('offline'));
    expect(await searchPlaces('x', 'gsi', 'ja', failing)).toEqual({ error: 'network' });
    expect(await searchPlaces('  ', 'gsi', 'ja', failing)).toEqual({ error: 'invalid' });
  });
});

describe('formatCoord', () => {
  it('rounds to 6 decimals without trailing zeros', () => {
    expect(formatCoord(35.681236789)).toBe('35.681237');
    expect(formatCoord(139.7)).toBe('139.7');
    expect(formatCoord(-0.0000004)).toBe('0');
  });
});

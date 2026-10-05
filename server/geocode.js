// Address -> map point, for picking the store nearest a farmer
// (server/ticketRouting.js). OpenStreetMap Nominatim, the same free service
// the storefront's "Use my current location" uses. Results are cached in the
// key-value store for good (a pincode or a store address does not move), so
// each place is looked up once; the service asks for at most one request a
// second and a contact in the User-Agent. Any failure returns null and the
// caller falls back to matching the district by name.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'SathyamAgroMart/1.0 (support@sathyamagromart.com)';
const CACHE_PREFIX = 'geo:v1:';
const MISS = 'none';

let lastCall = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function geocodeKey({ pincode, district, state, text } = {}) {
  const pin = String(pincode || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(pin)) return `pin:${pin}`;
  const words = [text, district, state].map(v => String(v || '').trim().toLowerCase()).filter(Boolean).join(', ');
  return words ? `q:${words.slice(0, 160)}` : '';
}

// Nominatim queries to try for a place, most precise first: the pincode
// (patchy for India in OpenStreetMap), then taluk + district + state, then
// district + state. [] when there is nothing to look up.
export function geocodeCandidates({ pincode, district, state, taluk, text } = {}) {
  const base = () => new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'in' });
  const out = [];
  const pin = String(pincode || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(pin)) {
    const p = base(); p.set('postalcode', pin); if (state) p.set('state', String(state)); out.push(p);
  }
  const clean = list => list.map(v => String(v || '').trim()).filter(Boolean);
  for (const parts of [clean([text, taluk, district, state]), clean([district, state])]) {
    if (!parts.length) continue;
    const q = `${parts.join(', ')}, India`;
    if (out.some(p => p.get('q') === q)) continue;
    const p = base(); p.set('q', q); out.push(p);
  }
  return out;
}

// The first query, kept for callers that want one.
export function geocodeParams(place) {
  return geocodeCandidates(place)[0] || null;
}

export function createGeocoder({ kvGet, kvSet, fetchImpl = fetch, minGapMs = 1100 } = {}) {
  return async function geocode(place) {
    const key = geocodeKey(place);
    if (!key || !geocodeCandidates(place).length) return null;
    const cached = kvGet ? await kvGet(CACHE_PREFIX + key).catch(() => null) : null;
    if (cached === MISS) return null;
    if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) return cached;

    let failed = false;
    for (const params of geocodeCandidates(place)) {
      const wait = lastCall + minGapMs - Date.now();
      if (wait > 0) await pause(wait);
      lastCall = Date.now();
      try {
        const res = await fetchImpl(`${NOMINATIM}?${params}`, {
          headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
          signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        });
        if (!res.ok) { failed = true; continue; }
        const list = await res.json();
        const hit = Array.isArray(list) ? list[0] : null;
        const point = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
        if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
          if (kvSet) await kvSet(CACHE_PREFIX + key, point).catch(() => {});
          return point;
        }
      } catch {
        failed = true;
      }
    }
    // Remember a place nobody can find, but not one the service failed on.
    if (!failed && kvSet) await kvSet(CACHE_PREFIX + key, MISS).catch(() => {});
    return null;
  };
}

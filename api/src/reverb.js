// Reverb.com — the marketplace for instruments and gear. Far better comps
// than eBay for guitars, amps, pedals, keyboards.
//
// Personal access token: reverb.com → Settings → My API tokens (free).
// Read-only listing search needs no special scopes.

const BASE = 'https://api.reverb.com/api';

export function reverbConfigured() {
  return Boolean(process.env.REVERB_TOKEN);
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.REVERB_TOKEN}`,
    Accept: 'application/hal+json',
    'Accept-Version': '3.0',
    'Content-Type': 'application/hal+json',
    'Accept-Language': 'en',
    'X-Display-Currency': 'USD',
  };
}

/**
 * Live listings matching a query.
 * @returns {Promise<{comps: Array, prices: number[]}>}
 */
export async function reverbComps(query, { limit = 25 } = {}) {
  const params = new URLSearchParams({
    query,
    per_page: String(limit),
    state: 'live',
    currency: 'USD',
    ships_to: 'US_CON',
  });
  const res = await fetch(`${BASE}/listings?${params}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Reverb search error ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const comps = (json.listings || [])
    .map(l => ({
      source: 'reverb',
      title: l.title,
      price: Number(l.price?.amount),
      currency: l.price?.currency || 'USD',
      condition: l.condition?.display_name || null,
      year: l.year || null,
      make: l.make || null,
      model: l.model || null,
      url: l._links?.web?.href || null,
      image: l.photos?.[0]?._links?.thumbnail?.href || l.photos?.[0]?._links?.small_crop?.href || null,
      buying: l.offers_enabled ? 'FIXED_PRICE,OFFERS' : 'FIXED_PRICE',
    }))
    .filter(c => Number.isFinite(c.price) && c.price > 0);

  return { comps, prices: comps.map(c => c.price) };
}

/**
 * Reverb Price Guide (estimated transaction range). Best-effort: the endpoint
 * has changed over the years, so a failure here is silently ignored.
 */
export async function reverbPriceGuide(query) {
  try {
    const res = await fetch(`${BASE}/priceguide?query=${encodeURIComponent(query)}&per_page=3`, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const g = (json.price_guides || [])[0];
    if (!g) return null;
    const low = Number(g.estimated_value?.price_low?.amount);
    const high = Number(g.estimated_value?.price_high?.amount);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    return { title: g.title, low, high, url: g._links?.web?.href || null };
  } catch {
    return null;
  }
}

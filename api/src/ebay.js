// eBay Browse API — active listings as comps.
// Sold/completed prices need the Marketplace Insights API, which requires a
// separate approval from eBay. Active listings are a decent proxy: sellers
// price against each other, and the low end of a sorted set is near market.

let tokenCache = { token: null, expiresAt: 0 };

const HOSTS = {
  production: { auth: 'https://api.ebay.com', api: 'https://api.ebay.com' },
  sandbox:    { auth: 'https://api.sandbox.ebay.com', api: 'https://api.sandbox.ebay.com' },
};

function host() {
  return HOSTS[process.env.EBAY_ENV === 'sandbox' ? 'sandbox' : 'production'];
}

export function ebayConfigured() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${host().auth}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });
  if (!res.ok) throw new Error(`eBay token error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return tokenCache.token;
}

/**
 * @returns {Promise<{comps: Array, stats: object|null}>}
 */
export async function ebayComps(query, { categoryId = null, limit = 50 } = {}) {
  const token = await getToken();
  // Default (best match) ordering. Sorting by price ascending buried complete
  // sets under cheap singles and "COA only" listings; relevance filtering
  // happens downstream anyway.
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    filter: 'buyingOptions:{FIXED_PRICE|AUCTION},conditions:{USED|NEW|UNSPECIFIED},priceCurrency:USD',
  });
  if (categoryId) params.set('category_ids', categoryId);

  const res = await fetch(`${host().api}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      ...(process.env.EBAY_CAMPAIGN_ID
        ? { 'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${process.env.EBAY_CAMPAIGN_ID}` }
        : {}),
    },
  });
  if (!res.ok) throw new Error(`eBay search error ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const comps = (json.itemSummaries || [])
    .map(it => ({
      source: 'ebay_active',
      title: it.title,
      price: Number(it.price?.value),
      currency: it.price?.currency || 'USD',
      condition: it.condition,
      url: it.itemWebUrl,
      image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
      shipping: it.shippingOptions?.[0]?.shippingCost?.value ?? null,
      buying: (it.buyingOptions || []).join(','),
    }))
    .filter(c => Number.isFinite(c.price) && c.price > 0);

  return { comps, stats: priceStats(comps.map(c => c.price)) };
}

export function priceStats(prices) {
  if (!prices.length) return null;
  const s = [...prices].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return {
    n: s.length,
    min: s[0],
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: s[s.length - 1],
  };
}

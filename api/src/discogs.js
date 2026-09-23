// Discogs — the authoritative source for LPs. Search for the release, then
// pull marketplace stats (lowest current price, number for sale) and the
// community "have/want" counts, which correlate with demand.

const BASE = 'https://api.discogs.com';

export function discogsConfigured() {
  return Boolean(process.env.DISCOGS_TOKEN);
}

function headers() {
  return {
    'User-Agent': process.env.DISCOGS_USER_AGENT || 'CollectableInventory/0.1',
    Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.query   free-text ("Pink Floyd Dark Side of the Moon")
 * @param {string} [opts.catno] catalog number from the sleeve/label — best identifier
 * @param {string} [opts.barcode]
 */
export async function discogsComps({ query, catno, barcode }) {
  const params = new URLSearchParams({ type: 'release', format: 'Vinyl', per_page: '8' });
  if (barcode) params.set('barcode', barcode);
  else if (catno) params.set('catno', catno);
  if (query) params.set('q', query);

  const sres = await fetch(`${BASE}/database/search?${params}`, { headers: headers() });
  if (!sres.ok) throw new Error(`Discogs search error ${sres.status}: ${await sres.text()}`);
  const search = await sres.json();
  const results = (search.results || []).slice(0, 5);

  const comps = [];
  for (const r of results) {
    // Marketplace stats: lowest listed price + count for sale
    let stats = null;
    try {
      const mres = await fetch(`${BASE}/marketplace/stats/${r.id}?curr_abbr=USD`, { headers: headers() });
      if (mres.ok) stats = await mres.json();
    } catch {}

    comps.push({
      source: 'discogs',
      release_id: r.id,
      title: r.title,
      year: r.year || null,
      label: (r.label || []).slice(0, 2).join(', '),
      catno: r.catno || null,
      country: r.country || null,
      format: (r.format || []).join(', '),
      url: `https://www.discogs.com${r.uri}`,
      image: r.thumb || null,
      price: stats?.lowest_price?.value ?? null,
      currency: stats?.lowest_price?.currency || 'USD',
      num_for_sale: stats?.num_for_sale ?? null,
      have: r.community?.have ?? null,
      want: r.community?.want ?? null,
    });
  }

  const prices = comps.map(c => c.price).filter(p => Number.isFinite(p) && p > 0);
  return { comps, prices };
}

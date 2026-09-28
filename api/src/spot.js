// Precious-metal spot prices (USD per troy oz) for melt-value floors.
//
// Source order:
//   1. metals.dev  (free key, ~25 calls/day) — result is cached for 24h in
//      Supabase (see cache.js) so restarts don't re-fetch. One call a day.
//   2. SPOT_SILVER / SPOT_GOLD / SPOT_PLATINUM env overrides (manual fallback)
//   3. null → valuation skips the melt floor and warns

import { cacheGet, cacheSet } from './cache.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const KEY = 'spot:metals.dev:USD:toz';
const METALS = ['silver', 'gold', 'platinum', 'palladium'];

/**
 * @param {object} [opts]
 * @param {boolean} [opts.fetchIfMissing=true]  false = report cache only, never spend a call
 */
export async function getSpotPrices({ fetchIfMissing = true } = {}) {
  const hit = await cacheGet(KEY);
  if (hit) return { ...hit.value, cached: true, expiresAt: new Date(hit.expiresAt).toISOString() };

  const key = process.env.METALS_DEV_API_KEY;
  if (key && fetchIfMissing) {
    try {
      const res = await fetch(
        `https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(key)}&currency=USD&unit=toz`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const json = await res.json();
        const m = json.metals || {};
        const prices = {};
        for (const k of METALS) if (Number.isFinite(Number(m[k]))) prices[k] = Number(m[k]);
        if (Object.keys(prices).length) {
          const value = { prices, source: 'metals.dev', asOf: json.timestamps?.metal || new Date().toISOString() };
          await cacheSet(KEY, value, TTL_MS);
          return { ...value, cached: false, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
        }
      } else {
        console.warn('metals.dev', res.status, await res.text());
      }
    } catch (e) {
      console.warn('metals.dev failed:', e.message);
    }
  }

  // Manual overrides (never cached — they're already free)
  const prices = {};
  for (const k of METALS) {
    const v = Number(process.env[`SPOT_${k.toUpperCase()}`]);
    if (Number.isFinite(v) && v > 0) prices[k] = v;
  }
  if (Object.keys(prices).length) return { prices, source: 'env override', asOf: null, cached: false };

  return { prices: null, source: null, asOf: null, cached: false };
}

/**
 * Melt value for a coin record from the AI pass.
 * @param {object} coin  { metal, fineness, troy_oz_each, count }
 */
export async function meltValue(coin) {
  if (!coin) return null;
  const metal = String(coin.metal || '').toLowerCase();
  if (!METALS.includes(metal)) return null;

  const ozEach = Number(coin.troy_oz_each) || 0;
  const ozTotal = Number(coin.troy_oz_total) || 0;
  const count = Math.max(1, Number(coin.count) || 1);

  // Mixed lots (some silver, some clad) carry the lot's total pure ounces in
  // troy_oz_total; uniform lots use per-coin × count. Total wins when set.
  const oz = ozTotal > 0 ? ozTotal : ozEach * count;
  if (!(oz > 0)) return null;

  const { prices, source, asOf } = await getSpotPrices();
  const spot = prices?.[metal];
  if (!spot) return null;

  return {
    melt: round(oz * spot),
    perCoin: ozTotal > 0 ? null : round(ozEach * spot),
    spot, metal, oz: round(oz, 4), count, mixed: ozTotal > 0, source, asOf,
  };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

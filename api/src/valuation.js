// Combine sources into a suggested price range.
import { ebayComps, ebayConfigured, priceStats } from './ebay.js';
import { discogsComps, discogsConfigured } from './discogs.js';
import { reverbComps, reverbPriceGuide, reverbConfigured } from './reverb.js';
import { meltValue } from './spot.js';
import { pcgsConfigured, pcgsByCert, pcgsByGrade, pcgsAprByCert, pcgsAprByGrade, factsMatchCoin } from './pcgs.js';
import { classifyComps } from './relevance.js';
import { ebayCategoryFor } from './categories.js';

/**
 * @param {object} item  { category, title, brand, model, identifiers, search_queries, condition, coin?, instrument? }
 */
export async function valueItem(item) {
  const raw = uniq([
    ...(item.search_queries || []),
    item.coin?.mint_product_name,
    item.instrument?.reverb_query,
    [item.brand, item.model].filter(Boolean).join(' '),
    item.title,
  ]).filter(q => q && q.trim().length > 2);
  // Long, exact titles often return zero on eBay. Add progressively shorter
  // variants so the search degrades gracefully instead of falling to melt-only.
  const queries = uniq(raw.flatMap(q => [q, ...simplify(q)])).filter(q => q.split(' ').length >= 2);

  const out = { sources: [], comps: [], warnings: [], melt: null, priceGuide: null, pcgs: null };

  // --- PCGS price guide + auction prices realized for coins ---
  if (item.category === 'coin' && item.coin) {
    if (pcgsConfigured()) {
      try {
        out.pcgs = await pcgsLookup(item.coin);
        if (out.pcgs?.apr?.length) out.comps.push(...out.pcgs.apr);
        if (out.pcgs?.guide_low != null) {
          out.sources.push({
            source: 'pcgs',
            stats: { n: out.pcgs.apr?.length || 0, median: out.pcgs.guide_mid, p25: out.pcgs.guide_low, p75: out.pcgs.guide_high },
          });
        } else if (out.pcgs?.note) {
          out.warnings.push(`PCGS: ${out.pcgs.note}`);
        }
      } catch (e) {
        out.warnings.push(`PCGS: ${e.message}`);
      }
    } else {
      out.warnings.push('PCGS not configured (PCGS_TOKEN) — using eBay + melt only');
    }
  }

  // --- Discogs for records (best data) ---
  if (item.category === 'lp_record') {
    if (discogsConfigured()) {
      try {
        const { comps, prices } = await discogsComps({
          query: queries[0],
          catno: item.identifiers?.catalog_number,
          barcode: item.identifiers?.upc,
        });
        out.comps.push(...comps);
        if (prices.length) out.sources.push({ source: 'discogs', stats: priceStats(prices) });
      } catch (e) {
        out.warnings.push(`Discogs: ${e.message}`);
      }
    } else {
      out.warnings.push('Discogs not configured (DISCOGS_TOKEN)');
    }
  }

  // --- Reverb for instruments (best data) ---
  if (item.category === 'musical_instrument') {
    if (reverbConfigured()) {
      const q = item.instrument?.reverb_query || queries[0];
      try {
        const { comps, prices } = await reverbComps(q);
        out.comps.push(...comps);
        if (prices.length) out.sources.push({ source: 'reverb', query: q, stats: priceStats(prices) });
        out.priceGuide = await reverbPriceGuide(q);
      } catch (e) {
        out.warnings.push(`Reverb: ${e.message}`);
      }
    } else {
      out.warnings.push('Reverb not configured (REVERB_TOKEN) — using eBay only');
    }
  }

  // --- Melt floor for precious-metal coins ---
  if (item.category === 'coin') {
    try {
      out.melt = await meltValue(item.coin);
      if (!out.melt && item.coin && ['silver', 'gold', 'platinum', 'palladium'].includes(String(item.coin.metal).toLowerCase())) {
        out.warnings.push('No spot price available — set METALS_DEV_API_KEY or SPOT_SILVER/SPOT_GOLD in .env for a melt floor');
      }
    } catch (e) {
      out.warnings.push(`Spot price: ${e.message}`);
    }
  }

  // --- eBay active listings (all categories) ---
  if (ebayConfigured()) {
    const categoryId = ebayCategoryFor(item.category);
    let found = false, tried = [];
    // Pass 1: within the eBay category. Pass 2: no category filter.
    outer: for (const cat of [categoryId, null]) {
      for (const q of queries.slice(0, 4)) {
        tried.push(q);
        try {
          const { comps, stats } = await ebayComps(q, { categoryId: cat });
          if (comps.length) {
            out.comps.push(...comps);
            out.sources.push({ source: 'ebay_active', query: q, stats, categoryFiltered: Boolean(cat) });
            found = true;
            break outer;
          }
        } catch (e) {
          out.warnings.push(`eBay: ${e.message}`);
          break outer;
        }
      }
      if (!categoryId) break;
    }
    if (!found && !out.warnings.some(w => w.startsWith('eBay:'))) {
      out.warnings.push(`eBay: no active listings matched (tried: ${uniq(tried).slice(0, 3).map(q => `"${q}"`).join(', ')}). Edit the search query and try again.`);
    }
  } else {
    out.warnings.push('eBay not configured (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)');
  }

  // --- Relevance pass: only true matches drive the numbers ---
  // Discogs and PCGS comps are keyed by release/cert so they're exact already;
  // eBay and Reverb are free-text searches and need filtering.
  const searchComps = out.comps.filter(c => c.source === 'ebay_active' || c.source === 'reverb');
  if (searchComps.length) {
    const { matches, partial, unrelated, method } = await classifyComps(item, searchComps);
    out.relevance = { method, matches: matches.length, partial: partial.length, unrelated: unrelated.length };
    for (const src of ['ebay_active', 'reverb']) {
      const idx = out.sources.findIndex(s => s.source === src);
      if (idx === -1) continue;
      const prices = matches.filter(c => c.source === src).map(c => c.price);
      if (prices.length >= 2) {
        out.sources[idx].stats = priceStats(prices);
        out.sources[idx].filtered = true;
      } else {
        out.sources.splice(idx, 1);
        const label = src === 'reverb' ? 'Reverb' : 'eBay';
        out.warnings.push(
          prices.length === 1
            ? `${label}: only 1 listing is the same item — not enough for a range. ${partial.length ? `${partial.length} listings are parts of it (e.g. single pieces of a set).` : ''} Try a different search or price it by hand.`
            : `${label}: found ${searchComps.filter(c => c.source === src).length} listings but none are the same item${partial.length ? ` (${partial.length} are components, ${unrelated.length} unrelated)` : ''}. Try a different search.`,
        );
      }
    }
    // Show matches first, then partial, then unrelated.
    const rank = { match: 0, partial: 1, unrelated: 2 };
    out.comps.sort((a, b) => (rank[a.relevance] ?? 0) - (rank[b.relevance] ?? 0));
  }

  // --- Suggested range ---
  // Prefer the specialist source; otherwise eBay. Active listings skew high
  // (unsold optimism), so suggest p25–median and call the median "suggested".
  const primary =
    out.sources.find(s => s.source === 'pcgs') ||
    out.sources.find(s => s.source === 'discogs') ||
    out.sources.find(s => s.source === 'reverb') ||
    out.sources.find(s => s.source === 'ebay_active');

  if (primary?.stats) {
    const s = primary.stats;
    let low = s.p25, high = s.p75, suggested = s.median;
    if (primary.source === 'ebay_active' || primary.source === 'reverb') {
      suggested = round2(s.median * conditionFactor(item.condition));
      low = round2(s.p25 * 0.85);
      high = round2(s.p75);
    }
    // Reverb price guide, when present, is a better range than asking prices.
    if (out.priceGuide) {
      low = out.priceGuide.low;
      high = out.priceGuide.high;
      suggested = round2((low + high) / 2 * conditionFactor(item.condition));
    }
    if (primary.source === 'pcgs') {
      // PCGS Price Guide is full retail; private/eBay sales typically clear at 70–85% of it.
      // If we have actual auction prices realized, lean on their median instead.
      const aprPrices = (out.pcgs.apr || []).map(a => a.price);
      const aprStats = priceStats(aprPrices);
      const count = Math.max(1, Number(item.coin?.count) || 1);
      if (aprStats && aprStats.n >= 3) {
        low = round2(aprStats.p25 * count);
        high = round2(aprStats.p75 * count);
        suggested = round2(aprStats.median * count);
      } else {
        low = round2(out.pcgs.guide_low * 0.7 * count);
        high = round2(out.pcgs.guide_high * count);
        suggested = round2(out.pcgs.guide_mid * 0.8 * count);
      }
      out.suggestion = {
        low, high, suggested,
        source: 'pcgs',
        basis: `PCGS ${out.pcgs.matched_by}: ${out.pcgs.name} — guide $${out.pcgs.guide_low}` +
          (out.pcgs.guide_high !== out.pcgs.guide_low ? `–$${out.pcgs.guide_high}` : '') +
          ` at ${out.pcgs.grade_label}` +
          (aprStats ? ` · ${aprStats.n} auction results, median $${aprStats.median}` : '') +
          (count > 1 ? ` · × ${count} coins` : ''),
      };
    } else {
      const label = { discogs: 'Discogs listings', reverb: 'Reverb listings', ebay_active: 'active eBay listings' }[primary.source];
      out.suggestion = {
        low, high, suggested,
        source: primary.source,
        basis: `${s.n} ${primary.filtered ? 'matching ' : ''}${label} (median $${s.median})` + (out.priceGuide ? ` · Reverb price guide $${out.priceGuide.low}–$${out.priceGuide.high}` : ''),
      };
    }
  } else {
    out.suggestion = null;
  }

  // --- Melt floor overrides anything below it ---
  if (out.melt) {
    const floor = round2(out.melt.melt);
    if (!out.suggestion) {
      out.suggestion = {
        low: floor, high: round2(floor * 1.25), suggested: round2(floor * 1.1),
        source: 'melt',
        basis: `Melt value only — no comps found: ${out.melt.oz} oz ${out.melt.metal} × $${out.melt.spot}/oz (${out.melt.source})`,
      };
      out.warnings.push('Suggestion is melt value only. Collector premium is not included — find comps before listing.');
    } else {
      if (out.suggestion.low < floor) out.suggestion.low = floor;
      if (out.suggestion.suggested < floor) out.suggestion.suggested = round2(floor * 1.05);
      if (out.suggestion.high < out.suggestion.suggested) out.suggestion.high = round2(out.suggestion.suggested * 1.15);
      out.suggestion.basis += ` · melt floor $${floor} (${out.melt.oz} oz ${out.melt.metal} @ $${out.melt.spot})`;
    }
  }

  if (!out.suggestion) out.warnings.push('No comps found — try editing the search query.');
  return out;
}

/**
 * Slabbed PCGS coin → exact guide value + APR for that cert.
 * Raw coin with a known PCGS# → guide at the low and high estimated grades,
 * verified against what the AI read (year / mint mark / denomination).
 */
async function pcgsLookup(coin) {
  const svc = String(coin.grading_service || '').toUpperCase();
  const cert = String(coin.cert_number || '').replace(/\D/g, '');

  if (svc === 'PCGS' && cert.length >= 7) {
    const facts = await pcgsByCert(cert);
    if (!facts?.price_guide) return { note: `cert ${cert} found but no price guide value`, facts };
    let apr = [];
    try { apr = await pcgsAprByCert(cert); } catch {}
    return {
      matched_by: 'cert', facts, apr,
      name: facts.name, grade_label: facts.grade,
      guide_low: facts.price_guide, guide_high: facts.price_guide, guide_mid: facts.price_guide,
      url: facts.url,
    };
  }

  const pcgsNo = String(coin.pcgs_number || '').replace(/\D/g, '');
  if (!pcgsNo) {
    const isSet = ['proof_set', 'mint_set', 'roll', 'bag'].includes(coin.product_type) || (Number(coin.count) || 1) > 1;
    return {
      note: svc === 'NGC'
        ? 'NGC slab — PCGS has no lookup for it; using eBay + melt'
        : isSet
          ? 'sets and lots have no single PCGS number — that\'s normal; using eBay + melt'
          : 'no PCGS number identified for this coin — enter one in Coin details if you know it; using eBay + melt',
    };
  }

  let gLow = clampGrade(coin.grade_estimate_low), gHigh = clampGrade(coin.grade_estimate_high);
  if (!gLow && !gHigh) { gLow = 40; gHigh = 58; }
  if (!gLow) gLow = gHigh;
  if (!gHigh) gHigh = gLow;
  if (gLow > gHigh) [gLow, gHigh] = [gHigh, gLow];

  const lowFacts = await pcgsByGrade(pcgsNo, gLow);
  if (!factsMatchCoin(lowFacts, coin)) {
    return { note: `PCGS #${pcgsNo} returned "${lowFacts?.name || '?'}" which doesn't match ${coin.year || ''}${coin.mint_mark ? '-' + coin.mint_mark : ''} ${coin.denomination || ''} — ignored`, facts: lowFacts };
  }
  const highFacts = gHigh !== gLow ? await pcgsByGrade(pcgsNo, gHigh) : lowFacts;
  const guideLow = lowFacts.price_guide, guideHigh = highFacts?.price_guide ?? guideLow;
  if (!guideLow) return { note: 'matched coin but PCGS has no guide value at that grade', facts: lowFacts };

  let apr = [];
  try { apr = await pcgsAprByGrade(pcgsNo, Math.round((gLow + gHigh) / 2)); } catch {}

  return {
    matched_by: 'PCGS#',
    facts: lowFacts, apr,
    name: lowFacts.name,
    grade_label: gLow === gHigh ? `grade ${gLow}` : `grades ${gLow}–${gHigh}`,
    guide_low: guideLow, guide_high: guideHigh, guide_mid: round2((guideLow + guideHigh) / 2),
    url: lowFacts.url,
  };
}
const clampGrade = g => { const n = Math.round(Number(g)); return Number.isFinite(n) && n >= 1 && n <= 70 ? n : 0; };

function conditionFactor(c) {
  switch ((c || '').toLowerCase()) {
    case 'mint': return 1.15;
    case 'excellent': return 1.0;
    case 'good': return 0.85;
    case 'fair': return 0.6;
    case 'poor': return 0.35;
    default: return 0.9;
  }
}
const round2 = n => Math.round(n * 100) / 100;
const uniq = arr => [...new Set(arr)];

/** Shorter variants of a search string, most specific first. */
function simplify(q) {
  const out = [];
  let s = q.replace(/\([^)]*\)/g, ' ')                       // drop parentheticals
           .replace(/\b(commemorative coin program|coin program|program|united states mint|us mint|u\.s\. mint)\b/gi, ' ')
           .replace(/[-–—,:/]/g, ' ')
           .replace(/\s+/g, ' ').trim();
  if (s && s !== q) out.push(s);
  const words = s.split(' ');
  if (words.length > 6) out.push(words.slice(0, 6).join(' '));
  if (words.length > 4) out.push(words.slice(0, 4).join(' '));
  return out;
}

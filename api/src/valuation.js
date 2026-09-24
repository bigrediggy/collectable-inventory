// Combine sources into a suggested price range.
import { ebayComps, ebayConfigured, priceStats } from './ebay.js';
import { discogsComps, discogsConfigured } from './discogs.js';
import { reverbComps, reverbPriceGuide, reverbConfigured } from './reverb.js';
import { meltValue } from './spot.js';
import { pcgsConfigured, pcgsByCert, pcgsByGrade, pcgsAprByCert, pcgsAprByGrade, factsMatchCoin } from './pcgs.js';
import { ebayCategoryFor } from './categories.js';

/**
 * @param {object} item  { category, title, brand, model, identifiers, search_queries, condition, coin?, instrument? }
 */
export async function valueItem(item) {
  const queries = uniq([
    ...(item.search_queries || []),
    item.coin?.mint_product_name,
    item.instrument?.reverb_query,
    [item.brand, item.model, item.title].filter(Boolean).join(' '),
    item.title,
  ]).filter(q => q && q.trim().length > 2);

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
    for (const q of queries.slice(0, 2)) {
      try {
        const { comps, stats } = await ebayComps(q, { categoryId });
        if (comps.length) {
          out.comps.push(...comps);
          out.sources.push({ source: 'ebay_active', query: q, stats });
          break; // first query that returns something wins
        }
      } catch (e) {
        out.warnings.push(`eBay: ${e.message}`);
        break;
      }
    }
  } else {
    out.warnings.push('eBay not configured (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)');
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
        basis: `${s.n} ${label} (median $${s.median})` + (out.priceGuide ? ` · Reverb price guide $${out.priceGuide.low}–$${out.priceGuide.high}` : ''),
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
        basis: `Melt value only: ${out.melt.oz} oz ${out.melt.metal} × $${out.melt.spot}/oz (${out.melt.source})`,
      };
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
  if (!pcgsNo) return { note: svc === 'NGC' ? 'NGC slab — no PCGS# to look up; using eBay + melt' : 'no PCGS number identified; using eBay + melt' };

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

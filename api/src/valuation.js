// Combine sources into a suggested price range.
import { ebayComps, ebayConfigured, priceStats } from './ebay.js';
import { discogsComps, discogsConfigured } from './discogs.js';
import { ebayCategoryFor } from './categories.js';

/**
 * @param {object} item  { category, title, brand, model, identifiers, search_queries, condition }
 */
export async function valueItem(item) {
  const queries = uniq([
    ...(item.search_queries || []),
    [item.brand, item.model, item.title].filter(Boolean).join(' '),
    item.title,
  ]).filter(q => q && q.trim().length > 2);

  const out = { sources: [], comps: [], warnings: [] };

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
  // Prefer Discogs for records; otherwise eBay. Active listings skew high
  // (unsold optimism), so suggest p25–median and call the median "suggested".
  const primary = out.sources.find(s => s.source === 'discogs') || out.sources.find(s => s.source === 'ebay_active');
  if (primary?.stats) {
    const s = primary.stats;
    let low = s.p25, high = s.p75, suggested = s.median;
    if (primary.source === 'ebay_active') {
      suggested = round2(s.median * conditionFactor(item.condition));
      low = round2(s.p25 * 0.85);
      high = round2(s.p75);
    }
    out.suggestion = {
      low, high, suggested,
      source: primary.source,
      basis: `${s.n} ${primary.source === 'discogs' ? 'Discogs listings' : 'active eBay listings'} (median $${s.median})`,
    };
  } else {
    out.suggestion = null;
    out.warnings.push('No comps found — try editing the search query.');
  }

  return out;
}

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

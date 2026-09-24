import React, { useState } from 'react';
import { value as apiValue } from '../lib/api.js';

// Runs a comp search for the item and lets the user accept the suggestion.
export default function Valuation({ item, onAccept }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const coin = item.attributes?.coin || item.ai_raw?.coin || null;
  const inst = item.attributes?.instrument || item.ai_raw?.instrument || null;
  const [query, setQuery] = useState(
    coin?.mint_product_name || inst?.reverb_query || (item.ai_raw?.search_queries || [])[0] || item.title || '',
  );

  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await apiValue({
        category: item.category,
        title: item.title,
        brand: item.brand,
        model: item.model,
        condition: item.condition,
        identifiers: item.identifiers,
        search_queries: [query],
        coin: coin ? { ...coin, count: coin.count || item.quantity || 1 } : null,
        instrument: inst ? { ...inst, reverb_query: query } : null,
      });
      setResult(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const s = result?.suggestion;

  return (
    <div className="card">
      <strong>Valuation</strong>
      {item.value_suggested != null && (
        <div className="muted small">
          Current: <span className="price">${fmt(item.value_suggested)}</span>
          {' '}(range ${fmt(item.value_low)}–${fmt(item.value_high)}, {item.value_source})
        </div>
      )}
      <label className="field"><span>Search query for comps</span>
        <input value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn" onClick={run} disabled={busy || !query}>
          {busy ? <span className="spinner" /> : 'Find comps'}
        </button>
        {err && <span className="err small">{err}</span>}
      </div>

      {result && (
        <div style={{ marginTop: 12 }}>
          {s ? (
            <div className="row">
              <div className="grow">
                <div>Suggested <span className="price">${fmt(s.suggested)}</span>
                  <span className="muted"> · range ${fmt(s.low)}–${fmt(s.high)}</span></div>
                <div className="muted small">{s.basis}</div>
              </div>
              <button className="btn" onClick={() => onAccept({
                value_low: s.low, value_high: s.high, value_suggested: s.suggested,
                value_source: s.source, value_comps: result.comps.slice(0, 20),
                valued_at: new Date().toISOString(),
                status: item.status === 'inventoried' ? 'valued' : item.status,
              })}>Use this</button>
            </div>
          ) : <div className="muted">No suggestion.</div>}

          {result.pcgs?.guide_low != null && (
            <div className="small" style={{ marginTop: 6 }}>
              PCGS price guide <span className="price">${fmt(result.pcgs.guide_low)}{result.pcgs.guide_high !== result.pcgs.guide_low ? `–$${fmt(result.pcgs.guide_high)}` : ''}</span>
              <span className="muted"> — {result.pcgs.name}, {result.pcgs.grade_label} (matched by {result.pcgs.matched_by})</span>
              {result.pcgs.url && <> · <a href={result.pcgs.url} target="_blank" rel="noreferrer">CoinFacts</a></>}
              {result.pcgs.facts?.population != null && <span className="muted"> · pop {result.pcgs.facts.population}{result.pcgs.facts.pop_higher != null ? ` / ${result.pcgs.facts.pop_higher} higher` : ''}</span>}
            </div>
          )}
          {result.melt && (
            <div className="small" style={{ marginTop: 6 }}>
              Melt value <span className="price">${fmt(result.melt.melt)}</span>
              <span className="muted"> — {result.melt.oz} oz {result.melt.metal} × ${fmt(result.melt.spot)}/oz
                ({result.melt.count > 1 ? `${result.melt.count} × $${fmt(result.melt.perCoin)}, ` : ''}{result.melt.source})</span>
            </div>
          )}
          {result.priceGuide && (
            <div className="small" style={{ marginTop: 4 }}>
              Reverb price guide: <span className="price">${fmt(result.priceGuide.low)}–${fmt(result.priceGuide.high)}</span>
              {result.priceGuide.url && <> · <a href={result.priceGuide.url} target="_blank" rel="noreferrer">{result.priceGuide.title}</a></>}
            </div>
          )}

          {result.warnings?.map((w, i) => <div key={i} className="small" style={{ color: 'var(--warn)' }}>{w}</div>)}

          {result.comps?.length > 0 && (
            <div className="comps" style={{ marginTop: 10 }}>
              {result.comps.slice(0, 15).map((c, i) => (
                <a className="comp" key={i} href={c.url} target="_blank" rel="noreferrer">
                  {c.image ? <img src={c.image} alt="" /> : <div style={{ width: 48 }} />}
                  <div className="grow">
                    <div className="small" title={c.title}>{c.title}</div>
                    <div className="muted small">
                      {c.source === 'discogs'
                        ? `${c.year || ''} ${c.label || ''} ${c.catno || ''} · ${c.num_for_sale ?? '?'} for sale · want ${c.want ?? '?'}`
                        : c.source === 'reverb'
                          ? `Reverb · ${c.year || ''} ${c.condition || ''}`
                          : c.source === 'pcgs_apr'
                            ? `Sold · ${c.house || 'auction'} ${c.date ? String(c.date).slice(0, 10) : ''}`
                            : `eBay · ${c.condition || ''} ${c.buying || ''}`}
                    </div>
                  </div>
                  <div className="price">{c.price != null ? `$${fmt(c.price)}` : '—'}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const fmt = n => (n == null ? '—' : Number(n).toFixed(2));

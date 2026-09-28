import React from 'react';
import { CATEGORIES, CONDITIONS, STATUSES, MARKETPLACES } from '../categories.js';

// Controlled form over the "items" row shape. Used by Capture (new) and ItemDetail (edit).
export default function ItemForm({ value, onChange, showSale = false }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setId = (k, v) => onChange({ ...value, identifiers: { ...(value.identifiers || {}), [k]: v } });
  const ids = value.identifiers || {};
  const attrs = value.attributes || {};
  const setSub = (group, k, v) =>
    onChange({ ...value, attributes: { ...attrs, [group]: { ...(attrs[group] || {}), [k]: v } } });
  const coin = attrs.coin || {};
  const inst = attrs.instrument || {};

  return (
    <div>
      <label className="field"><span>Title</span>
        <input value={value.title || ''} onChange={e => set('title', e.target.value)} />
      </label>

      <div className="chips" style={{ margin: '8px 0' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} type="button"
            className={'chip' + (value.category === c.id ? ' active' : '')}
            onClick={() => set('category', c.id)}>{c.icon} {c.label}</button>
        ))}
      </div>

      <div className="grid2">
        <label className="field"><span>Subcategory</span>
          <input value={value.subcategory || ''} onChange={e => set('subcategory', e.target.value)} />
        </label>
        <label className="field"><span>Condition</span>
          <select value={value.condition || 'Unknown'} onChange={e => set('condition', e.target.value)}>
            {CONDITIONS.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Brand / maker / artist</span>
          <input value={value.brand || ''} onChange={e => set('brand', e.target.value)} />
        </label>
        <label className="field"><span>Model / album / title</span>
          <input value={value.model || ''} onChange={e => set('model', e.target.value)} />
        </label>
        <label className="field"><span>Year</span>
          <input value={value.year_made || ''} onChange={e => set('year_made', e.target.value)} />
        </label>
        <label className="field"><span>Quantity</span>
          <input type="number" min="1" value={value.quantity ?? 1} onChange={e => set('quantity', Number(e.target.value) || 1)} />
        </label>
        <label className="field"><span>Location in house</span>
          <input value={value.location || ''} placeholder="Basement, shelf 3" onChange={e => set('location', e.target.value)} />
        </label>
      </div>

      {value.category === 'coin' && (
        <details open>
          <summary className="muted">Coin details (used for the melt floor and Mint product search)</summary>
          <div className="grid2">
            <label className="field"><span>Product type</span>
              <select value={coin.product_type || 'other'} onChange={e => setSub('coin', 'product_type', e.target.value)}>
                {['circulated_coin', 'uncirculated_coin', 'proof_coin', 'proof_set', 'mint_set', 'commemorative', 'bullion', 'roll', 'bag', 'currency_note', 'other']
                  .map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </label>
            <label className="field"><span>Mint product name (exact)</span>
              <input value={coin.mint_product_name || ''} onChange={e => setSub('coin', 'mint_product_name', e.target.value)} />
            </label>
            <label className="field"><span>Series</span>
              <input value={coin.series || ''} onChange={e => setSub('coin', 'series', e.target.value)} />
            </label>
            <label className="field"><span>Year / mint mark</span>
              <input value={[coin.year, coin.mint_mark].filter(Boolean).join('-')} placeholder="1986-S"
                onChange={e => { const [y, m] = e.target.value.split('-'); onChange({ ...value, attributes: { ...attrs, coin: { ...coin, year: y || '', mint_mark: m || '' } } }); }} />
            </label>
            <label className="field"><span>Metal</span>
              <select value={coin.metal || 'unknown'} onChange={e => setSub('coin', 'metal', e.target.value)}>
                {['silver', 'gold', 'platinum', 'palladium', 'copper', 'clad', 'nickel', 'unknown'].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="field"><span>Pure metal, troy oz each</span>
              <input type="number" step="0.0001" value={coin.troy_oz_each ?? ''} onChange={e => setSub('coin', 'troy_oz_each', e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
            <label className="field"><span>Count in lot</span>
              <input type="number" min="1" value={coin.count ?? 1} onChange={e => setSub('coin', 'count', Number(e.target.value) || 1)} />
            </label>
            <label className="field"><span>Pure metal, troy oz TOTAL (mixed lots — overrides each × count)</span>
              <input type="number" step="0.0001" value={coin.troy_oz_total ?? ''} placeholder="e.g. 0.7734 for a set with one silver dollar"
                onChange={e => setSub('coin', 'troy_oz_total', e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
            <label className="field"><span>Grading service (slabbed only)</span>
              <select value={coin.grading_service || 'none'} onChange={e => setSub('coin', 'grading_service', e.target.value)}>
                {['none', 'PCGS', 'NGC', 'ANACS', 'other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span>Cert number (from slab label)</span>
              <input inputMode="numeric" value={coin.cert_number || ''} onChange={e => setSub('coin', 'cert_number', e.target.value)} />
            </label>
            <label className="field"><span>PCGS coin # (raw coins)</span>
              <input inputMode="numeric" value={coin.pcgs_number || ''} placeholder="e.g. 7296" onChange={e => setSub('coin', 'pcgs_number', e.target.value)} />
            </label>
            <label className="field"><span>Grade estimate (Sheldon 1–70)</span>
              <div className="row" style={{ gap: 6 }}>
                <input type="number" min="1" max="70" style={{ width: 90 }} value={coin.grade_estimate_low ?? ''} placeholder="low"
                  onChange={e => setSub('coin', 'grade_estimate_low', Number(e.target.value) || 0)} />
                <span>to</span>
                <input type="number" min="1" max="70" style={{ width: 90 }} value={coin.grade_estimate_high ?? ''} placeholder="high"
                  onChange={e => setSub('coin', 'grade_estimate_high', Number(e.target.value) || 0)} />
              </div>
            </label>
            <label className="field"><span>Packaging</span>
              <input value={coin.packaging || ''} onChange={e => setSub('coin', 'packaging', e.target.value)} />
            </label>
          </div>
        </details>
      )}

      {value.category === 'musical_instrument' && (
        <details open>
          <summary className="muted">Instrument details (used for the Reverb search)</summary>
          <div className="grid2">
            <label className="field"><span>Reverb search</span>
              <input value={inst.reverb_query || ''} onChange={e => setSub('instrument', 'reverb_query', e.target.value)} />
            </label>
            <label className="field"><span>Type</span>
              <input value={inst.type || ''} onChange={e => setSub('instrument', 'type', e.target.value)} />
            </label>
            <label className="field"><span>Country of manufacture</span>
              <input value={inst.country_of_manufacture || ''} onChange={e => setSub('instrument', 'country_of_manufacture', e.target.value)} />
            </label>
            <label className="field"><span>Finish / color</span>
              <input value={inst.finish_color || ''} onChange={e => setSub('instrument', 'finish_color', e.target.value)} />
            </label>
            <label className="field"><span>Case included</span>
              <input value={inst.case_included || ''} onChange={e => setSub('instrument', 'case_included', e.target.value)} />
            </label>
            <label className="field"><span>Modifications / repairs</span>
              <input value={inst.modifications || ''} onChange={e => setSub('instrument', 'modifications', e.target.value)} />
            </label>
          </div>
        </details>
      )}

      <details>
        <summary className="muted">Identifiers (serial, catalog #, issue #, mint mark…)</summary>
        <div className="grid2">
          {['serial', 'catalog_number', 'upc', 'issue_number', 'publisher', 'mint_mark', 'denomination', 'other'].map(k => (
            <label className="field" key={k}><span>{k.replace('_', ' ')}</span>
              <input value={ids[k] || ''} onChange={e => setId(k, e.target.value)} />
            </label>
          ))}
        </div>
      </details>

      <label className="field"><span>Description (listing text)</span>
        <textarea value={value.description || ''} onChange={e => set('description', e.target.value)} />
      </label>

      <label className="field"><span>Private notes</span>
        <textarea value={value.notes || ''} style={{ minHeight: 60 }} onChange={e => set('notes', e.target.value)} />
      </label>

      {showSale && (
        <div className="card">
          <strong>Sale status</strong>
          <div className="grid2">
            <label className="field"><span>Status</span>
              <select value={value.status || 'inventoried'} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Marketplace</span>
              <select value={value.marketplace || ''} onChange={e => set('marketplace', e.target.value || null)}>
                <option value="">—</option>
                {MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="field"><span>Listing URL</span>
              <input value={value.listing_url || ''} onChange={e => set('listing_url', e.target.value)} />
            </label>
            <label className="field"><span>Listing price ($)</span>
              <input type="number" step="0.01" value={value.listing_price ?? ''} onChange={e => set('listing_price', numOrNull(e.target.value))} />
            </label>
            <label className="field"><span>Views</span>
              <input type="number" value={value.views ?? 0} onChange={e => set('views', Number(e.target.value) || 0)} />
            </label>
            <label className="field"><span>Watchers / saves</span>
              <input type="number" value={value.watchers ?? 0} onChange={e => set('watchers', Number(e.target.value) || 0)} />
            </label>
            <label className="field"><span>Inquiries / messages</span>
              <input type="number" value={value.inquiries ?? 0} onChange={e => set('inquiries', Number(e.target.value) || 0)} />
            </label>
            <label className="field"><span>Sold price ($)</span>
              <input type="number" step="0.01" value={value.sold_price ?? ''} onChange={e => set('sold_price', numOrNull(e.target.value))} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

const numOrNull = v => (v === '' ? null : Number(v));

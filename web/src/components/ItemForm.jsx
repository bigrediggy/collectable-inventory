import React from 'react';
import { CATEGORIES, CONDITIONS, STATUSES, MARKETPLACES } from '../categories.js';

// Controlled form over the "items" row shape. Used by Capture (new) and ItemDetail (edit).
export default function ItemForm({ value, onChange, showSale = false }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const setId = (k, v) => onChange({ ...value, identifiers: { ...(value.identifiers || {}), [k]: v } });
  const ids = value.identifiers || {};

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

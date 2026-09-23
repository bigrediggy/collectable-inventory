import React, { useEffect, useState } from 'react';
import { counts, listItems } from '../lib/supabase.js';
import { STATUSES } from '../categories.js';

export default function Dashboard() {
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => { counts().then(setC).catch(e => setErr(e.message)); }, []);

  async function exportCsv() {
    const rows = await listItems();
    const cols = ['id', 'title', 'category', 'subcategory', 'brand', 'model', 'year_made', 'condition', 'location',
      'quantity', 'value_low', 'value_high', 'value_suggested', 'value_source', 'status', 'marketplace',
      'listing_price', 'views', 'watchers', 'inquiries', 'sold_price', 'sold_at', 'description', 'notes', 'created_at'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map(r => cols.map(k => esc(r[k])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (err) return <p className="err">{err}</p>;
  if (!c) return <div className="row"><span className="spinner" /> Loading…</div>;

  return (
    <div>
      <div className="stats">
        <div className="stat"><div className="n">{c.total}</div><div className="muted">items</div></div>
        <div className="stat"><div className="n">${c.valueSum.toFixed(0)}</div><div className="muted">suggested value</div></div>
        <div className="stat"><div className="n">${c.soldSum.toFixed(0)}</div><div className="muted">sold so far</div></div>
        {STATUSES.map(s => c.byStatus[s.id] ? (
          <div className="stat" key={s.id}><div className="n">{c.byStatus[s.id]}</div><div className="muted">{s.label.toLowerCase()}</div></div>
        ) : null)}
      </div>
      <div className="card">
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <div className="muted small" style={{ marginTop: 6 }}>Full inventory as a spreadsheet — handy for an estate-sale company or the attorney.</div>
      </div>
    </div>
  );
}

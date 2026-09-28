import React, { useEffect, useState } from 'react';
import { listItems, photoUrl } from '../lib/supabase.js';
import { CATEGORIES, STATUSES, catIcon } from '../categories.js';

export default function Inventory({ inventory, onOpen }) {
  const [items, setItems] = useState(null);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    listItems({ inventoryId: inventory.id, category, status, search })
      .then(d => alive && setItems(d))
      .catch(e => alive && setErr(e.message));
    return () => { alive = false; };
  }, [inventory.id, category, status, search]);

  return (
    <div>
      <div className="card">
        <input placeholder="Search title, brand, model, location…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="chips" style={{ marginTop: 8 }}>
          <button className={'chip' + (!category ? ' active' : '')} onClick={() => setCategory('')}>All</button>
          {CATEGORIES.map(c => (
            <button key={c.id} className={'chip' + (category === c.id ? ' active' : '')} onClick={() => setCategory(c.id)}>{c.icon} {c.label}</button>
          ))}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          <button className={'chip' + (!status ? ' active' : '')} onClick={() => setStatus('')}>Any status</button>
          {STATUSES.map(s => (
            <button key={s.id} className={'chip' + (status === s.id ? ' active' : '')} onClick={() => setStatus(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      {err && <p className="err">{err}</p>}
      {items === null && <div className="row"><span className="spinner" /> Loading…</div>}
      {items?.length === 0 && <p className="muted">Nothing in {inventory.name} yet.</p>}

      <div className="list">
        {items?.map(it => {
          const p = it.item_photos?.find(x => x.is_primary) || it.item_photos?.[0];
          return (
            <button className="item" key={it.id} onClick={() => onOpen(it.id)}>
              {p ? <img src={photoUrl(p.storage_path)} alt="" loading="lazy" /> : <div className="noimg">{catIcon(it.category)}</div>}
              <div className="grow">
                <div className="t">{it.title}</div>
                <div className="muted small">{[it.brand, it.model, it.year_made, it.location].filter(Boolean).join(' · ')}</div>
                <div className="row small" style={{ marginTop: 4 }}>
                  <span className={'badge ' + it.status}>{it.status}</span>
                  {it.value_suggested != null && <span className="price">${Number(it.value_suggested).toFixed(0)}</span>}
                  {it.sold_price != null && <span className="ok">sold ${Number(it.sold_price).toFixed(0)}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

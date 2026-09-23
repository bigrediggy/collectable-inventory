import React, { useEffect, useRef, useState } from 'react';
import { getItem, updateItem, deleteItem, uploadPhoto, photoUrl } from '../lib/supabase.js';
import { fileToResizedJpeg } from '../lib/image.js';
import ItemForm from '../components/ItemForm.jsx';
import Valuation from '../components/Valuation.jsx';

export default function ItemDetail({ id, onDeleted }) {
  const [item, setItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const camRef = useRef();

  async function load() {
    const it = await getItem(id);
    setItem(it); setDraft(stripJoins(it));
  }
  useEffect(() => { load().catch(e => setMsg(e.message)); }, [id]);

  async function save(extra = {}) {
    setBusy(true); setMsg(null);
    try {
      const fields = { ...draft, ...extra };
      if (fields.status === 'sold' && fields.sold_price != null && !fields.sold_at) fields.sold_at = new Date().toISOString();
      if (fields.status === 'listed' && !fields.listed_at) fields.listed_at = new Date().toISOString();
      await updateItem(id, fields);
      await load();
      setMsg('Saved');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function addPhoto(files) {
    setBusy(true);
    try {
      for (const f of files) await uploadPhoto(id, await fileToResizedJpeg(f), { isPrimary: !item.item_photos?.length });
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('Delete this item and its photos?')) return;
    await deleteItem(id);
    onDeleted();
  }

  function copyListing() {
    const text = [
      draft.title,
      '',
      draft.description,
      '',
      [draft.brand && `Brand: ${draft.brand}`, draft.model && `Model: ${draft.model}`, draft.year_made && `Year: ${draft.year_made}`,
       draft.condition && `Condition: ${draft.condition}`].filter(Boolean).join('\n'),
      draft.value_suggested != null ? `\nAsking: $${Number(draft.value_suggested).toFixed(0)}` : '',
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => setMsg('Listing text copied — paste into Facebook / eBay / Craigslist'));
  }

  if (!item || !draft) return <div className="row"><span className="spinner" /> Loading…</div>;

  const photos = [...(item.item_photos || [])].sort((a, b) => (b.is_primary - a.is_primary) || a.created_at.localeCompare(b.created_at));

  return (
    <div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden
        onChange={e => { addPhoto([...e.target.files]); e.target.value = ''; }} />

      {photos[0] && <img className="hero-photo" src={photoUrl(photos[0].storage_path)} alt="" />}
      <div className="card">
        <div className="thumbs">
          {photos.map(p => <img key={p.id} src={photoUrl(p.storage_path)} alt="" />)}
          <button className="add" onClick={() => camRef.current.click()}>📷</button>
        </div>
      </div>

      <Valuation item={item} onAccept={extra => save(extra)} />

      <div className="card">
        <ItemForm value={draft} onChange={setDraft} showSale />
        {msg && <p className={msg === 'Saved' || msg.startsWith('Listing') ? 'ok' : 'err'}>{msg}</p>}
        <div className="row">
          <button className="btn grow" disabled={busy} onClick={() => save()}>{busy ? <span className="spinner" /> : 'Save changes'}</button>
          <button className="btn secondary" onClick={copyListing}>Copy listing text</button>
          <button className="btn danger" onClick={remove}>Delete</button>
        </div>
      </div>

      <div className="muted small">
        Added {new Date(item.created_at).toLocaleString()} · id {item.id}
      </div>
    </div>
  );
}

// remove joined relations before sending back to update()
function stripJoins(it) {
  const { item_photos, id, created_at, updated_at, ...rest } = it;
  return rest;
}

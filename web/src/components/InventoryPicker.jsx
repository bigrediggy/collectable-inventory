import React, { useState } from 'react';
import { createInventory } from '../lib/supabase.js';

// Dropdown of inventories + a small inline form to add one.
export default function InventoryPicker({ inventories, currentId, onSelect, onCreated }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const inv = await createInventory({ name, owner, notes });
      setName(''); setOwner(''); setNotes(''); setAdding(false);
      onCreated(inv);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="row" style={{ gap: 6 }}>
        <select
          value={currentId || ''}
          onChange={e => e.target.value === '__new' ? setAdding(true) : onSelect(e.target.value)}
          style={{ width: 'auto', minHeight: 40, padding: '6px 10px' }}
          aria-label="Inventory"
        >
          {inventories.map(i => (
            <option key={i.id} value={i.id}>{i.name}{i.owner ? ` — ${i.owner}` : ''}</option>
          ))}
          <option value="__new">＋ New inventory…</option>
        </select>
      </div>

      {adding && (
        <form className="card" onSubmit={save} style={{ marginTop: 8 }}>
          <strong>New inventory</strong>
          <div className="grid2">
            <label className="field"><span>Name</span>
              <input autoFocus value={name} placeholder="e.g. Wizard of Oz collection" onChange={e => setName(e.target.value)} />
            </label>
            <label className="field"><span>Whose is it?</span>
              <input value={owner} placeholder="e.g. Chloe" onChange={e => setOwner(e.target.value)} />
            </label>
          </div>
          <label className="field"><span>Notes (optional)</span>
            <input value={notes} placeholder="where it lives, goal, deadline…" onChange={e => setNotes(e.target.value)} />
          </label>
          {err && <p className="err">{err}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : 'Create'}</button>
            <button className="btn secondary" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </>
  );
}

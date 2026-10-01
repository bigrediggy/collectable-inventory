import React, { useEffect, useState } from 'react';
import { listMembers, addMemberByEmail, removeMember, updateInventory, deleteInventory } from '../lib/supabase.js';

// Owner/admin controls for one inventory: rename, share by email, remove members, delete.
export default function SharePanel({ inventory, me, isAdmin, onChanged, onDeleted, onClose }) {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [name, setName] = useState(inventory.name);
  const [owner, setOwner] = useState(inventory.owner || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const canManage = isAdmin || inventory.owner_id === me?.id;

  async function load() { setMembers(await listMembers(inventory.id)); }
  useEffect(() => { load().catch(e => setMsg(e.message)); }, [inventory.id]);

  async function run(fn, okMsg) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); if (okMsg) setMsg(okMsg); onChanged?.(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="row">
        <strong className="grow">{inventory.name}</strong>
        <button className="btn secondary" onClick={onClose}>Close</button>
      </div>
      <div className="muted small">
        Owner: {inventory.owner_profile?.display_name || inventory.owner_profile?.email || '—'}
      </div>

      {canManage && (
        <>
          <div className="grid2">
            <label className="field"><span>Inventory name</span>
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="field"><span>Whose stuff</span>
              <input value={owner} onChange={e => setOwner(e.target.value)} />
            </label>
          </div>
          <button className="btn secondary" disabled={busy || (name === inventory.name && owner === (inventory.owner || ''))}
            onClick={() => run(() => updateInventory(inventory.id, { name: name.trim(), owner: owner.trim() || null }), 'Saved')}>
            Save name
          </button>
        </>
      )}

      <h4 style={{ margin: '14px 0 6px' }}>People with access</h4>
      {!members && <span className="spinner" />}
      {members?.length === 0 && <div className="muted small">Only the owner{isAdmin ? ' (and admins)' : ''}.</div>}
      {members?.map(m => (
        <div className="row small" key={m.user_id} style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
          <span className="grow">{m.profile?.display_name || m.profile?.email}
            <span className="muted"> · {m.profile?.email} · {m.role}</span></span>
          {canManage && <button className="btn secondary" disabled={busy} onClick={() => run(() => removeMember(inventory.id, m.user_id))}>Remove</button>}
        </div>
      ))}

      {canManage && (
        <form className="row" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (email) run(() => addMemberByEmail(inventory.id, email, role).then(() => setEmail('')), 'Added'); }}>
          <input className="grow" type="email" placeholder="email of someone who has signed up" value={email} onChange={e => setEmail(e.target.value)} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: 'auto' }}>
            <option value="editor">can edit</option>
            <option value="viewer">view only</option>
          </select>
          <button className="btn" type="submit" disabled={busy || !email}>Share</button>
        </form>
      )}

      {msg && <p className={/saved|added/i.test(msg) ? 'ok' : 'err'}>{msg}</p>}

      {canManage && (
        <div style={{ marginTop: 16 }}>
          <button className="btn danger" disabled={busy} onClick={() => {
            if (!window.confirm(`Delete "${inventory.name}"? Only works when it has no items.`)) return;
            run(() => deleteInventory(inventory.id).then(() => onDeleted?.()));
          }}>Delete inventory</button>
          <div className="muted small" style={{ marginTop: 4 }}>Move or delete its items first; deletion is blocked while items exist.</div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { adminOverview, listProfiles, setAdmin, reassignInventory, deleteInventory } from '../lib/supabase.js';

// Superuser view: every inventory and every user.
export default function Admin({ me, onChanged }) {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const [r, u] = await Promise.all([adminOverview(), listProfiles()]);
    setRows(r); setUsers(u);
  }
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);

  async function run(fn) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); onChanged?.(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!rows || !users) return <div className="row"><span className="spinner" /> Loading…</div>;

  return (
    <div>
      {msg && <p className="err">{msg}</p>}

      <div className="card">
        <strong>Inventories ({rows.length})</strong>
        {rows.map(r => (
          <div key={r.inventory_id} className="row small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="grow">
              <div><strong>{r.inventory_name}</strong> · {r.item_count} items · {r.member_count} shared</div>
              <div className="muted">owner: {r.owner_email || '— unassigned —'}</div>
            </div>
            <select value={r.owner_id || ''} disabled={busy} style={{ width: 'auto' }}
              onChange={e => run(() => reassignInventory(r.inventory_id, e.target.value || null))}>
              <option value="">(no owner)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}
            </select>
            <button className="btn danger" disabled={busy || Number(r.item_count) > 0}
              title={Number(r.item_count) > 0 ? 'Move or delete its items first' : 'Delete'}
              onClick={() => window.confirm(`Delete "${r.inventory_name}"?`) && run(() => deleteInventory(r.inventory_id))}>
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <strong>Users ({users.length})</strong>
        {users.map(u => (
          <div key={u.id} className="row small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="grow">
              <div>{u.display_name || '—'} <span className="muted">· {u.email}</span></div>
              <div className="muted">joined {new Date(u.created_at).toLocaleDateString()}{u.is_admin ? ' · admin' : ''}</div>
            </div>
            <button className="btn secondary" disabled={busy || u.id === me.id}
              onClick={() => run(() => setAdmin(u.id, !u.is_admin))}>
              {u.is_admin ? 'Remove admin' : 'Make admin'}
            </button>
          </div>
        ))}
        <div className="muted small" style={{ marginTop: 8 }}>
          New users sign up themselves from the login screen. To stop open sign-ups, turn off "Enable sign ups" under Authentication → Providers → Email in Supabase.
        </div>
      </div>
    </div>
  );
}

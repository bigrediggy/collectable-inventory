import React, { useEffect, useState } from 'react';
import { configured, listInventories } from './lib/supabase.js';
import Capture from './screens/Capture.jsx';
import Inventory from './screens/Inventory.jsx';
import ItemDetail from './screens/ItemDetail.jsx';
import Dashboard from './screens/Dashboard.jsx';
import InventoryPicker from './components/InventoryPicker.jsx';

const LS_KEY = 'inventory:current';

export default function App() {
  const [tab, setTab] = useState('capture');
  const [openId, setOpenId] = useState(null);
  const [inventories, setInventories] = useState(null);
  const [invId, setInvId] = useState(() => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } });
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!configured) return;
    listInventories()
      .then(list => {
        setInventories(list);
        if (!list.find(i => i.id === invId)) setInvId(list[0]?.id || '');
      })
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => { try { if (invId) localStorage.setItem(LS_KEY, invId); } catch {} }, [invId]);

  if (!configured) {
    return (
      <div className="app">
        <div className="card">
          <h2>Not configured</h2>
          <p>Copy <code>web/.env.example</code> to <code>web/.env</code> and fill in your Supabase URL and anon key, then rebuild.</p>
        </div>
      </div>
    );
  }

  const open = id => { setOpenId(id); setTab('inventory'); };
  const closeDetail = () => setOpenId(null);
  const current = inventories?.find(i => i.id === invId) || null;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          {tab === 'capture' && 'Add item'}
          {tab === 'inventory' && (openId ? 'Item' : 'Inventory')}
          {tab === 'dashboard' && 'Overview'}
        </h1>
        {inventories && !openId && (
          <InventoryPicker
            inventories={inventories}
            currentId={invId}
            onSelect={setInvId}
            onCreated={inv => { setInventories(l => [...l, inv]); setInvId(inv.id); }}
          />
        )}
        {openId && <button className="btn secondary" onClick={closeDetail}>Back</button>}
      </header>

      {err && <p className="err">{err} — did you run <code>supabase/migration_inventories.sql</code>?</p>}
      {!inventories && !err && <div className="row"><span className="spinner" /> Loading…</div>}

      {inventories && !current && (
        <div className="card">No inventory yet — create one with the dropdown above.</div>
      )}

      {current && tab === 'capture' && <Capture inventory={current} onSaved={open} />}
      {current && tab === 'inventory' && (openId
        ? <ItemDetail id={openId} inventories={inventories} onDeleted={closeDetail} />
        : <Inventory inventory={current} onOpen={open} />)}
      {current && tab === 'dashboard' && <Dashboard inventory={current} />}

      <nav className="tabbar">
        <button className={tab === 'capture' ? 'active' : ''} onClick={() => { closeDetail(); setTab('capture'); }}>
          <span className="ico">📷</span>Add
        </button>
        <button className={tab === 'inventory' ? 'active' : ''} onClick={() => { closeDetail(); setTab('inventory'); }}>
          <span className="ico">📋</span>Inventory
        </button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => { closeDetail(); setTab('dashboard'); }}>
          <span className="ico">📊</span>Overview
        </button>
      </nav>
    </div>
  );
}

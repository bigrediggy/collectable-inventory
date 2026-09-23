import React, { useState } from 'react';
import { configured } from './lib/supabase.js';
import Capture from './screens/Capture.jsx';
import Inventory from './screens/Inventory.jsx';
import ItemDetail from './screens/ItemDetail.jsx';
import Dashboard from './screens/Dashboard.jsx';

export default function App() {
  const [tab, setTab] = useState('capture');
  const [openId, setOpenId] = useState(null);

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

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          {tab === 'capture' && 'Add item'}
          {tab === 'inventory' && (openId ? 'Item' : 'Inventory')}
          {tab === 'dashboard' && 'Overview'}
        </h1>
        {openId && <button className="btn secondary" onClick={closeDetail}>Back</button>}
      </header>

      {tab === 'capture' && <Capture onSaved={open} />}
      {tab === 'inventory' && (openId
        ? <ItemDetail id={openId} onDeleted={closeDetail} />
        : <Inventory onOpen={open} />)}
      {tab === 'dashboard' && <Dashboard onOpen={open} />}

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

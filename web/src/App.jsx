import React, { useEffect, useState } from 'react';
import { configured, listInventories, getSession, onAuthChange, getProfile, signOut } from './lib/supabase.js';
import Login from './screens/Login.jsx';
import Capture from './screens/Capture.jsx';
import Inventory from './screens/Inventory.jsx';
import ItemDetail from './screens/ItemDetail.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Admin from './screens/Admin.jsx';
import InventoryPicker from './components/InventoryPicker.jsx';
import SharePanel from './components/SharePanel.jsx';

const LS_KEY = 'inventory:current';

export default function App() {
  const [session, setSession] = useState(undefined);   // undefined = loading
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('capture');
  const [openId, setOpenId] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [inventories, setInventories] = useState(null);
  const [invId, setInvId] = useState(() => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } });
  const [err, setErr] = useState(null);

  // --- auth ---
  useEffect(() => {
    if (!configured) return;
    getSession().then(setSession);
    const { data: sub } = onAuthChange(s => setSession(s));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setInventories(null); return; }
    getProfile().then(setProfile).catch(e => setErr(e.message));
    reloadInventories();
  }, [session?.user?.id]);

  function reloadInventories() {
    setErr(null);
    return listInventories()
      .then(list => {
        setInventories(list);
        setInvId(cur => list.find(i => i.id === cur) ? cur : (list[0]?.id || ''));
      })
      .catch(e => setErr(e.message));
  }

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

  if (session === undefined) return <div className="app"><div className="row" style={{ padding: 40 }}><span className="spinner" /> Loading…</div></div>;
  if (!session) return <Login />;

  const isAdmin = Boolean(profile?.is_admin);
  const me = session.user;
  const open = id => { setOpenId(id); setSharing(false); setTab('inventory'); };
  const closeDetail = () => setOpenId(null);
  const current = inventories?.find(i => i.id === invId) || null;
  const go = t => { closeDetail(); setSharing(false); setTab(t); };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          {tab === 'capture' && 'Add item'}
          {tab === 'inventory' && (openId ? 'Item' : 'Inventory')}
          {tab === 'dashboard' && 'Overview'}
          {tab === 'admin' && 'Admin'}
        </h1>
        {inventories && !openId && tab !== 'admin' && (
          <InventoryPicker
            inventories={inventories}
            currentId={invId}
            onSelect={setInvId}
            onCreated={inv => reloadInventories().then(() => setInvId(inv.id))}
          />
        )}
        {current && !openId && tab !== 'admin' && (
          <button className="btn secondary" title="Share / rename / delete" onClick={() => setSharing(s => !s)}>⚙</button>
        )}
        {openId && <button className="btn secondary" onClick={closeDetail}>Back</button>}
        <button className="btn secondary" title={me.email} onClick={() => signOut()}>Sign out</button>
      </header>

      <div className="muted small" style={{ margin: '6px 0' }}>
        Signed in as {profile?.display_name || me.email}{isAdmin ? ' · admin' : ''}
      </div>

      {err && <p className="err">{err} — did you run <code>supabase/migration_auth.sql</code>?</p>}
      {!inventories && !err && <div className="row"><span className="spinner" /> Loading…</div>}

      {inventories && !current && tab !== 'admin' && (
        <div className="card">No inventory yet — create one with the dropdown above{isAdmin ? ', or assign yourself one from Admin' : ''}.</div>
      )}

      {sharing && current && (
        <SharePanel
          inventory={current} me={me} isAdmin={isAdmin}
          onChanged={reloadInventories}
          onDeleted={() => { setSharing(false); reloadInventories(); }}
          onClose={() => setSharing(false)}
        />
      )}

      {current && tab === 'capture' && <Capture inventory={current} onSaved={open} />}
      {current && tab === 'inventory' && (openId
        ? <ItemDetail id={openId} inventories={inventories} onDeleted={closeDetail} />
        : <Inventory inventory={current} onOpen={open} />)}
      {current && tab === 'dashboard' && <Dashboard inventory={current} />}
      {isAdmin && tab === 'admin' && <Admin me={me} onChanged={reloadInventories} />}

      <nav className="tabbar">
        <button className={tab === 'capture' ? 'active' : ''} onClick={() => go('capture')}>
          <span className="ico">📷</span>Add
        </button>
        <button className={tab === 'inventory' ? 'active' : ''} onClick={() => go('inventory')}>
          <span className="ico">📋</span>Inventory
        </button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => go('dashboard')}>
          <span className="ico">📊</span>Overview
        </button>
        {isAdmin && (
          <button className={tab === 'admin' ? 'active' : ''} onClick={() => go('admin')}>
            <span className="ico">🛠️</span>Admin
          </button>
        )}
      </nav>
    </div>
  );
}

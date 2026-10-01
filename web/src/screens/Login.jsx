import React, { useState } from 'react';
import { signIn, signUp, resetPassword } from '../lib/supabase.js';

export default function Login() {
  const [mode, setMode] = useState('signin');   // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await signUp(email, password, name);
        if (error) throw error;
        if (!data.session) setMsg('Check your email for a confirmation link, then sign in.');
      } else {
        const { error } = await resetPassword(email);
        if (error) throw error;
        setMsg('Password reset email sent.');
      }
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="app" style={{ maxWidth: 420, paddingTop: 40 }}>
      <h1 style={{ fontSize: '1.4rem' }}>Collectable Inventory</h1>
      <form className="card" onSubmit={submit}>
        <strong>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</strong>
        {mode === 'signup' && (
          <label className="field"><span>Your name</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="field"><span>Email</span>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== 'reset' && (
          <label className="field"><span>Password</span>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <button className="btn big" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset email'}
        </button>
        <div className="row small" style={{ marginTop: 12, justifyContent: 'space-between' }}>
          {mode !== 'signin' && <a href="#" onClick={e => { e.preventDefault(); setMode('signin'); }}>Sign in</a>}
          {mode !== 'signup' && <a href="#" onClick={e => { e.preventDefault(); setMode('signup'); }}>Create account</a>}
          {mode !== 'reset' && <a href="#" onClick={e => { e.preventDefault(); setMode('reset'); }}>Forgot password</a>}
        </div>
      </form>
    </div>
  );
}

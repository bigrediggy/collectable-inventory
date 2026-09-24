import React, { useRef, useState } from 'react';
import { fileToResizedJpeg, blobToBase64 } from '../lib/image.js';
import { analyze } from '../lib/api.js';
import { insertItem, uploadPhoto } from '../lib/supabase.js';
import ItemForm from '../components/ItemForm.jsx';

const EMPTY = { title: '', category: 'other', condition: 'Unknown', quantity: 1, identifiers: {}, attributes: {} };

export default function Capture({ onSaved }) {
  const [photos, setPhotos] = useState([]);       // [{blob, url}]
  const [hint, setHint] = useState('');
  const [lot, setLot] = useState(false);       // set / roll / lot of several pieces
  const [item, setItem] = useState(EMPTY);
  const [phase, setPhase] = useState('shoot');    // shoot | analyzing | review | saving
  const [err, setErr] = useState(null);
  const camRef = useRef();
  const galleryRef = useRef();

  async function addFiles(files) {
    const next = [];
    for (const f of files) {
      const blob = await fileToResizedJpeg(f);
      next.push({ blob, url: URL.createObjectURL(blob) });
    }
    setPhotos(p => [...p, ...next]);
  }

  async function runAnalyze() {
    setErr(null); setPhase('analyzing');
    try {
      const images = await Promise.all(photos.slice(0, 4).map(async p => ({
        data: await blobToBase64(p.blob), media_type: 'image/jpeg',
      })));
      const fullHint = [
        lot ? 'This is ONE lot: a set, roll, bag, or group of several pieces sold together. Count them, describe the lot as a whole, and put the count in coin.count / attributes.quantity_in_photo.' : '',
        hint,
      ].filter(Boolean).join(' ');
      const ai = await analyze(images, fullHint);
      setItem({
        title: ai.title || '',
        category: ai.category || 'other',
        subcategory: ai.subcategory || '',
        brand: ai.brand || '',
        model: ai.model || '',
        year_made: ai.year_made || '',
        condition: ai.condition || 'Unknown',
        identifiers: ai.identifiers || {},
        attributes: {
          ...(ai.attributes || {}),
          ...(ai.coin ? { coin: ai.coin } : {}),
          ...(ai.instrument ? { instrument: ai.instrument } : {}),
        },
        description: [ai.description, ai.condition_notes ? `Condition: ${ai.condition_notes}` : '']
          .filter(Boolean).join('\n\n'),
        quantity: Number(ai.coin?.count) || Number(ai.attributes?.quantity_in_photo) || 1,
        ai_raw: ai,
        ai_confidence: ai.confidence,
      });
      setPhase('review');
    } catch (e) {
      setErr(e.message); setPhase('shoot');
    }
  }

  function skipAI() {
    setItem({ ...EMPTY, ai_raw: null });
    setPhase('review');
  }

  async function save() {
    setErr(null); setPhase('saving');
    try {
      const row = await insertItem({ ...item, status: 'inventoried' });
      for (let i = 0; i < photos.length; i++) {
        await uploadPhoto(row.id, photos[i].blob, { isPrimary: i === 0 });
      }
      photos.forEach(p => URL.revokeObjectURL(p.url));
      setPhotos([]); setHint(''); setItem(EMPTY); setPhase('shoot');
      onSaved(row.id);
    } catch (e) {
      setErr(e.message); setPhase('review');
    }
  }

  function reset() {
    photos.forEach(p => URL.revokeObjectURL(p.url));
    setPhotos([]); setHint(''); setLot(false); setItem(EMPTY); setPhase('shoot'); setErr(null);
  }

  return (
    <div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { addFiles([...e.target.files]); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden
        onChange={e => { addFiles([...e.target.files]); e.target.value = ''; }} />

      <div className="card">
        <div className="thumbs">
          {photos.map((p, i) => (
            <img key={i} src={p.url} alt="" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))} title="Tap to remove" />
          ))}
          <button className="add" onClick={() => camRef.current.click()} title="Take photo">📷</button>
          <button className="add" onClick={() => galleryRef.current.click()} title="From gallery">🖼️</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>
          First photo becomes the main one. Add a second shot of labels, serial numbers, or the back. Tap a photo to remove it.
        </div>
      </div>

      {phase === 'shoot' && (
        <div className="card">
          <div className="chips" style={{ marginBottom: 6 }}>
            <button type="button" className={'chip' + (!lot ? ' active' : '')} onClick={() => setLot(false)}>Single item</button>
            <button type="button" className={'chip' + (lot ? ' active' : '')} onClick={() => setLot(true)}>Set / roll / lot</button>
          </div>
          <label className="field"><span>Optional hint for the AI</span>
            <input value={hint} placeholder='e.g. "Gibson, bought new in 1972" or "found in attic"'
              onChange={e => setHint(e.target.value)} />
          </label>
          <button className="btn big" disabled={!photos.length} onClick={runAnalyze}>
            Describe with AI
          </button>
          <div style={{ marginTop: 8 }}>
            <button className="btn secondary" onClick={skipAI}>Skip AI, enter manually</button>
          </div>
          {err && <p className="err">{err}</p>}
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="card row"><span className="spinner" /> Looking at the photos…</div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div className="card">
          {item.ai_confidence != null && (
            <div className="muted small">AI confidence: {(item.ai_confidence * 100).toFixed(0)}% — check the details before saving.</div>
          )}
          <ItemForm value={item} onChange={setItem} />
          {err && <p className="err">{err}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn grow" disabled={phase === 'saving' || !item.title} onClick={save}>
              {phase === 'saving' ? <span className="spinner" /> : 'Save to inventory'}
            </button>
            <button className="btn secondary" disabled={phase === 'saving'} onClick={runAnalyze}>Re-run AI</button>
            <button className="btn secondary" disabled={phase === 'saving'} onClick={reset}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const KEY = import.meta.env.VITE_APP_KEY || '';

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-app-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API ${res.status}`);
  return json;
}

export const health  = () => call('/api/health');
export const analyze = (images, hint) => call('/api/analyze', { images, hint });
export const value   = (item) => call('/api/value', item);

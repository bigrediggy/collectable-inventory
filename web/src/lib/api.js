const API = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const KEY = import.meta.env.VITE_APP_KEY || '';

async function call(path, body, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-app-key': KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`No reply from the API after ${timeoutMs / 1000}s (${API}). Is it running, and can it reach the internet?`);
    throw new Error(`Can't reach the API at ${API}: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API ${res.status}`);
  return json;
}

export const health  = () => call('/api/health');
export const analyze = (images, hint) => call('/api/analyze', { images, hint });
export const value   = (item) => call('/api/value', item);

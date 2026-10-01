// Two-layer cache: in-memory for speed, Supabase `api_cache` table for
// persistence across restarts (Render free tier restarts on every wake-up,
// so memory alone burns through daily API quotas).
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in api/.env (the service
// role bypasses RLS; the api_cache table has no user policies on purpose) and
// the table from supabase/api_cache.sql. Falls back to memory-only if absent.

import { createClient } from '@supabase/supabase-js';

const mem = new Map();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = process.env.SUPABASE_URL && serviceKey
  ? createClient(process.env.SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
  : null;

export const cachePersistent = Boolean(sb);

/** @returns {Promise<{value:any, expiresAt:number}|null>} */
export async function cacheGet(key) {
  const m = mem.get(key);
  if (m && m.expiresAt > Date.now()) return m;
  if (!sb) return null;
  try {
    const { data } = await sb.from('api_cache').select('value, expires_at').eq('key', key).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const hit = { value: data.value, expiresAt: new Date(data.expires_at).getTime() };
      mem.set(key, hit);
      return hit;
    }
  } catch (e) {
    console.warn('cache read failed:', e.message);
  }
  return null;
}

export async function cacheSet(key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  mem.set(key, { value, expiresAt });
  if (!sb) return;
  try {
    await sb.from('api_cache').upsert({ key, value, expires_at: new Date(expiresAt).toISOString() });
  } catch (e) {
    console.warn('cache write failed:', e.message);
  }
}

/** Memoize an async fetcher under a key. */
export async function cached(key, ttlMs, fetcher) {
  const hit = await cacheGet(key);
  if (hit) return hit.value;
  const value = await fetcher();
  await cacheSet(key, value, ttlMs);
  return value;
}

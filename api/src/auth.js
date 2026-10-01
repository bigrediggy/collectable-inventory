// Verifies the Supabase login token the PWA sends as "Authorization: Bearer <jwt>".
// Falls back to the legacy shared APP_KEY only if REQUIRE_LOGIN=false.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const authClient = url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;

export const loginRequired = String(process.env.REQUIRE_LOGIN ?? 'true').toLowerCase() !== 'false';

// Small cache so a burst of requests from one session doesn't hit Supabase every time.
const cache = new Map(); // token -> { user, exp }
const TTL = 5 * 60 * 1000;

export async function userFromRequest(req) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token || !authClient) return null;
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  cache.set(token, { user: data.user, exp: Date.now() + TTL });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data.user;
}

export function authMiddleware() {
  return async (req, res, next) => {
    if (req.path === '/health') return next();
    try {
      const user = await userFromRequest(req);
      if (user) { req.user = user; return next(); }
      if (!loginRequired && process.env.APP_KEY && req.get('x-app-key') === process.env.APP_KEY) return next();
      return res.status(401).json({ error: loginRequired ? 'sign in required' : 'bad app key' });
    } catch (e) { next(e); }
  };
}

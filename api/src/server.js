import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeItem } from './analyze.js';
import { valueItem } from './valuation.js';
import { ebayConfigured } from './ebay.js';
import { discogsConfigured } from './discogs.js';
import { reverbConfigured } from './reverb.js';
import { getSpotPrices } from './spot.js';
import { pcgsConfigured } from './pcgs.js';
import { cachePersistent } from './cache.js';
import { authMiddleware, loginRequired } from './auth.js';
import { CATEGORIES } from './categories.js';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
}));
app.use(express.json({ limit: '30mb' })); // base64 photos from a tablet camera

// Every /api call (except health) must come from a signed-in user.
app.use('/api', authMiddleware());

app.get('/api/health', async (_req, res) => {
  // Health never spends an API call: it only reports what's cached.
  const spot = await getSpotPrices({ fetchIfMissing: false });
  res.json({
    ok: true,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ebay: ebayConfigured(),
    discogs: discogsConfigured(),
    reverb: reverbConfigured(),
    pcgs: pcgsConfigured(),
    cache: cachePersistent ? 'supabase' : 'memory only (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
    auth: loginRequired ? 'login required' : 'app key or login',
    spot: spot.prices
      ? { ...spot.prices, source: spot.source, asOf: spot.asOf, expiresAt: spot.expiresAt || null }
      : (process.env.METALS_DEV_API_KEY ? 'not fetched yet — first coin valuation will fetch and cache for 24h' : null),
    categories: CATEGORIES,
  });
});

// POST /api/analyze  { images: [{data, media_type}], hint?: string }
app.post('/api/analyze', async (req, res, next) => {
  try {
    const { images, hint } = req.body || {};
    const result = await analyzeItem(images, hint);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/value  { category, title, brand, model, condition, identifiers, search_queries }
app.post('/api/value', async (req, res, next) => {
  try {
    const result = await valueItem(req.body || {});
    res.json(result);
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message, raw: err.raw });
});

app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

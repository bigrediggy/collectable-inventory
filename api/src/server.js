import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeItem } from './analyze.js';
import { valueItem } from './valuation.js';
import { ebayConfigured } from './ebay.js';
import { discogsConfigured } from './discogs.js';
import { CATEGORIES } from './categories.js';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
}));
app.use(express.json({ limit: '30mb' })); // base64 photos from a tablet camera

// Tiny shared-secret gate so only your PWA can spend your API credits.
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  const want = process.env.APP_KEY;
  if (want && req.get('x-app-key') !== want) {
    return res.status(401).json({ error: 'bad app key' });
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ebay: ebayConfigured(),
    discogs: discogsConfigured(),
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

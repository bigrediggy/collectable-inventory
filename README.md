# Collectable Inventory

An installable web app (PWA) for a Samsung Galaxy Tab that lets you walk through a house,
photograph items, have AI describe and categorize them, look up comparable prices, and keep
everything in a database with sale-status tracking.

```
collectable-inventory/
├── supabase/schema.sql   # database tables, storage bucket, policies
├── api/                  # Node/Express: Claude vision + eBay/Discogs valuation
└── web/                  # Vite + React PWA (camera, forms, inventory, dashboard)
```

## How it works

1. **Add** tab → take a photo (or several) → *Describe with AI*. Claude reads the photo and
   returns a title, category, brand/model, year, condition, identifiers (serial, catalog #,
   issue #, mint mark…), a listing description, and suggested eBay search strings.
2. You correct anything, add the room it's in, and *Save*. Photos go to Supabase Storage,
   the record goes to the `items` table.
3. Open the item → **Find comps**. For LPs it queries Discogs (lowest listed price,
   how many for sale, want-list count). For everything it queries eBay active listings.
   It suggests a price range (p25–p75) and a "suggested" price (median × condition factor).
   *Use this* stores the range plus the comps on the item.
4. Update status (listed / sold / donated / kept), marketplace, listing URL, views,
   watchers, sold price. *Copy listing text* puts a ready-to-paste listing on the clipboard
   for Facebook Marketplace / Craigslist / eBay.
5. **Overview** tab → totals and a CSV export.

## Setup (about 30 minutes)

### 1. Supabase (database + photo storage)
1. Create a free project at https://supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Project Settings → API → copy the **Project URL** and **anon public** key.

> The schema's RLS policies allow the anon key full access. That is fine for a
> household tool where the only place the key lives is the app on your tablet. If you
> want a login screen, see the comment block in `schema.sql`.

### 2. API keys
| Service | Where | Needed for |
|---|---|---|
| Anthropic | https://console.anthropic.com → API keys | AI description (required) |
| eBay | https://developer.ebay.com → My Account → Application Keys → **Production** keyset | Comps for all categories |
| Discogs | https://www.discogs.com/settings/developers → Generate token | LP comps |

eBay's Browse API works with just the client ID/secret (no user login). It returns
**active** listings. Sold-price history is the *Marketplace Insights* API, which needs a
separate approval from eBay; if you get it, add a call in `api/src/ebay.js` alongside
`ebayComps()`.

### 3. Run locally
```bash
cd api && cp .env.example .env   # fill in keys
npm install && npm run dev       # http://localhost:8787

cd ../web && cp .env.example .env   # Supabase URL/key, API URL, APP_KEY
npm install && npm run dev          # http://localhost:5173 (also on your LAN)
```
`npm run dev -- --host` prints a LAN address; open that on the tablet to test with a
real camera before deploying. Chrome requires HTTPS for the camera except on
`localhost`, so for LAN testing either use Vite's `--https` flag or just deploy (step 4).

### 4. Deploy
- **API** → any Node host: Railway, Render, Fly.io, a $5 VPS. Set the env vars from
  `api/.env.example`. Note the public URL.
- **Web** → Vercel or Netlify (free). Build command `npm run build`, output `dist`.
  Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_APP_KEY`.
- Put the web URL in the API's `CORS_ORIGINS`.

### 5. Install on the Galaxy Tab
Open the web URL in Chrome → ⋮ menu → **Add to Home screen** (or "Install app").
It launches full-screen, uses the rear camera, and caches the app shell so it opens
instantly. Photos and data still need a connection (Wi-Fi is fine).

## Category → API mapping
| Category | Comps source | Notes |
|---|---|---|
| LP / vinyl | Discogs → eBay fallback | Catalog # on the label/spine gives the best match |
| Coins | eBay | Photograph both sides + the mint mark; consider PCGS/NGC price guides manually for anything graded |
| Comics | eBay | Issue # and publisher matter; underground comix often list under "Comix" |
| Instruments | eBay | Reverb.com is often better for pricing; paste the search there manually |
| Toys / models / electronics / furniture / knick-knacks | eBay | |

## Phase 2 ideas (not built yet)
- Post directly to eBay with the Sell API and pull views/watchers automatically.
- Reverb API for instruments (needs an approved app).
- PCGS/Numista lookup for coins by year + mint mark.
- Print a QR label per item that opens its record.
- Simple email login (Supabase Auth) if more than one person will use it.

## Costs
Claude Sonnet vision ≈ 1–2¢ per item. Supabase free tier covers thousands of items and
1 GB of photos (at 1600px JPEG that's ~4,000 photos). eBay and Discogs APIs are free
at this volume.

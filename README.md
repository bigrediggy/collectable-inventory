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

0. Pick the **inventory** in the top bar (one per person or collection — Val's house, the Oz collection, your own stuff). "＋ New inventory…" in the same dropdown adds one. The choice is remembered on the device. An item can be moved between inventories from its detail page.
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
2. SQL Editor → paste `supabase/schema.sql` → Run. Then paste `supabase/api_cache.sql` → Run (small table the API uses to cache spot prices and PCGS lookups so daily quotas aren't wasted). Then `supabase/migration_inventories.sql` → Run (multiple inventories; seeds "Val's house" and attaches any existing items to it).
3. Project Settings → API → copy the **Project URL** and **anon public** key.

4. Then run `supabase/migration_auth.sql`. Before that, under Authentication → Providers,
   make sure **Email** is enabled (turn off "Confirm email" while testing if you want
   instant sign-ups). After running it, sign up in the app, then run the STEP 2 block at
   the bottom of that file with your email to make yourself admin and take ownership of
   the existing inventories.
5. Project Settings → API → copy the **service_role** key too; it goes only in the API's
   env (never the web app).

> With `migration_auth.sql` applied, every table has real row-level security: a user
> sees only inventories they own or have been shared on; admins see everything.

### 2. API keys
| Service | Where | Needed for |
|---|---|---|
| Anthropic | https://console.anthropic.com → API keys | AI description (required) |
| eBay | https://developer.ebay.com → My Account → Application Keys → **Production** keyset | Comps for all categories |
| Discogs | https://www.discogs.com/settings/developers → Generate token | LP comps |
| Reverb | https://reverb.com → Settings → My API tokens → Generate | Instrument comps + price guide |
| PCGS | https://www.pcgs.com/publicapi → register → access token | Coin price guide + auction prices realized (low daily limit; lookups cached) |
| metals.dev | https://metals.dev → free key | Live silver/gold spot for coin melt floors (or set `SPOT_SILVER` / `SPOT_GOLD` by hand) |

eBay's Browse API works with just the client ID/secret (no user login). It returns
**active** listings. Sold-price history is the *Marketplace Insights* API, which needs a
separate approval from eBay; if you get it, add a call in `api/src/ebay.js` alongside
`ebayComps()`.

### Users, sharing and admin
- Anyone can create an account from the login screen (disable "Enable sign ups" in
  Supabase → Authentication → Providers → Email to make it invite-only).
- Each inventory has an owner. The ⚙ button next to the inventory picker opens
  rename / share / delete. Share by entering the email of someone who has signed up;
  "can edit" lets them add and value items, "view only" lets them look.
- Admins (flag set in Admin tab, or via SQL for the first one) get an **Admin** tab
  listing every inventory and user: reassign owners, delete empty inventories, promote
  or demote admins.
- The API only answers signed-in users (it verifies the Supabase login token).

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
  `api/.env.example` — including `SUPABASE_URL` / `SUPABASE_ANON_KEY` (same values as the web app) so the cache persists across restarts. Note the public URL.
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
| Coins | PCGS price guide + auction results → eBay by Mint product name; **melt floor** under everything | Use the *Set / roll / lot* toggle for proof sets, rolls and bags — one photo covers the lot. The AI fills metal, pure troy oz and count; check those three fields, they drive the floor. Slabbed PCGS coins: photograph the label so the cert number is readable — that gives an exact guide value. Raw coins: the AI proposes a PCGS # and a grade range; the app verifies year/mint mark before trusting it, and you can correct both in *Coin details*. |
| Comics | eBay | Issue # and publisher matter; underground comix often list under "Comix" |
| Instruments | Reverb listings + Reverb price guide → eBay fallback | Photograph the headstock/serial and any inside label; country of manufacture changes value several-fold |
| Toys / models / electronics / furniture / knick-knacks | eBay | |

## Phase 3 ideas (not built yet)
- Post directly to eBay with the Sell API and pull views/watchers automatically.
- Print a QR label per item that opens its record.
- Simple email login (Supabase Auth) if more than one person will use it.

## Costs
Claude Sonnet vision ≈ 1–2¢ per item. Supabase free tier covers thousands of items and
1 GB of photos (at 1600px JPEG that's ~4,000 photos). eBay and Discogs APIs are free
at this volume.

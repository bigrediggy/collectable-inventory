-- Collectable Inventory — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type item_category as enum (
  'musical_instrument',
  'vintage_toy',
  'model_airplane',
  'lp_record',
  'comic',
  'coin',
  'electronics',
  'furniture',
  'knick_knack',
  'other'
);

create type item_status as enum (
  'inventoried',   -- photographed and recorded
  'valued',        -- has a suggested price
  'listed',        -- posted on a marketplace
  'sold',
  'donated',
  'kept',
  'trashed'
);

-- ---------- Items ----------
create table items (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  title         text not null,
  description   text,
  category      item_category not null default 'other',
  subcategory   text,                 -- e.g. "acoustic guitar", "Hot Wheels", "1/48 scale"
  brand         text,
  model         text,
  year_made     text,                 -- text: "c. 1960s" is common
  condition     text,                 -- Mint / Excellent / Good / Fair / Poor
  identifiers   jsonb default '{}',   -- serial, catalog #, UPC, mint mark, issue #, etc.
  attributes    jsonb default '{}',   -- free-form: color, size, material, completeness...
  ai_raw        jsonb,                -- full structured output from the AI pass
  ai_confidence numeric(3,2),         -- 0.00–1.00

  location      text,                 -- room / shelf in the house
  quantity      int not null default 1,

  -- valuation
  value_low     numeric(12,2),
  value_high    numeric(12,2),
  value_suggested numeric(12,2),
  value_source  text,                 -- "ebay_active", "discogs", "manual", ...
  value_comps   jsonb,                -- array of {title, price, url, source}
  valued_at     timestamptz,

  -- sale tracking (phase 2, columns here so the schema doesn't churn)
  status        item_status not null default 'inventoried',
  marketplace   text,                 -- "ebay", "facebook", "craigslist", "estate_sale"
  listing_url   text,
  listing_price numeric(12,2),
  listed_at     timestamptz,
  views         int default 0,
  watchers      int default 0,
  inquiries     int default 0,
  sold_price    numeric(12,2),
  sold_at       timestamptz,
  buyer_note    text,

  notes         text
);

create index items_category_idx on items (category);
create index items_status_idx   on items (status);
create index items_created_idx  on items (created_at desc);

-- ---------- Photos ----------
create table item_photos (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  storage_path text not null,        -- path in the "item-photos" bucket
  is_primary  boolean not null default false,
  caption     text
);

create index item_photos_item_idx on item_photos (item_id);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- ---------- Storage bucket ----------
-- Create a PUBLIC bucket named "item-photos" in Dashboard → Storage,
-- or run:
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- ---------- Row Level Security ----------
-- This is a single-user household tool. The simplest safe setup is:
--   * enable RLS
--   * allow the anon key full access ONLY from your app (the anon key is
--     never exposed anywhere except the PWA you install on the tablet).
-- If you'd rather require login, swap `true` for `auth.role() = 'authenticated'`
-- and enable Email auth in the dashboard.

alter table items       enable row level security;
alter table item_photos enable row level security;

create policy "household full access" on items
  for all using (true) with check (true);

create policy "household full access" on item_photos
  for all using (true) with check (true);

create policy "household photo read"   on storage.objects
  for select using (bucket_id = 'item-photos');
create policy "household photo write"  on storage.objects
  for insert with check (bucket_id = 'item-photos');
create policy "household photo delete" on storage.objects
  for delete using (bucket_id = 'item-photos');

-- ---------- Handy view for export ----------
-- security_invoker so the view respects RLS of the caller (Supabase flags
-- the default SECURITY DEFINER behaviour as a lint error).
create or replace view inventory_export with (security_invoker = on) as
select
  i.id, i.title, i.category, i.subcategory, i.brand, i.model, i.year_made,
  i.condition, i.location, i.quantity,
  i.value_low, i.value_high, i.value_suggested, i.value_source,
  i.status, i.marketplace, i.listing_price, i.sold_price, i.sold_at,
  i.description, i.notes, i.created_at,
  (select storage_path from item_photos p
     where p.item_id = i.id order by is_primary desc, created_at asc limit 1) as primary_photo
from items i
order by i.created_at desc;

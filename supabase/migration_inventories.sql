-- Multiple inventories (one per person / collection).
-- Run once in the Supabase SQL editor AFTER schema.sql.

create table if not exists inventories (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,            -- "Val's house", "Wizard of Oz collection"
  owner       text,                     -- whose stuff it is
  notes       text,
  is_archived boolean not null default false
);

alter table inventories enable row level security;
create policy "household full access" on inventories
  for all using (true) with check (true);

-- Seed the first inventory and attach every existing item to it.
insert into inventories (name, owner)
select 'Val''s house', 'Val Ziedins'
where not exists (select 1 from inventories);

alter table items add column if not exists inventory_id uuid references inventories(id) on delete restrict;

update items set inventory_id = (select id from inventories order by created_at limit 1)
where inventory_id is null;

alter table items alter column inventory_id set not null;
create index if not exists items_inventory_idx on items (inventory_id, created_at desc);

-- Export view now carries the inventory name.
create or replace view inventory_export with (security_invoker = on) as
select
  inv.name as inventory, inv.owner,
  i.id, i.title, i.category, i.subcategory, i.brand, i.model, i.year_made,
  i.condition, i.location, i.quantity,
  i.value_low, i.value_high, i.value_suggested, i.value_source,
  i.status, i.marketplace, i.listing_price, i.sold_price, i.sold_at,
  i.description, i.notes, i.created_at,
  (select storage_path from item_photos p
     where p.item_id = i.id order by is_primary desc, created_at asc limit 1) as primary_photo
from items i
join inventories inv on inv.id = i.inventory_id
order by inv.name, i.created_at desc;

-- Authentication, ownership, sharing and real row-level security.
-- Run once in the Supabase SQL editor AFTER migration_inventories.sql.
--
-- Before running: Dashboard → Authentication → Providers → Email: enabled.
-- (Optionally turn OFF "Confirm email" while testing so sign-ups work instantly.)
--
-- AFTER running: sign up in the app with your own email, then run the
-- "STEP 2" block at the bottom with that email to make yourself admin and
-- take ownership of the existing inventories.

-- ---------- Profiles (one row per auth user) ----------
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile when someone signs up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill profiles for anyone who signed up before this migration.
insert into profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------- Ownership + sharing ----------
alter table inventories add column if not exists owner_id uuid references profiles(id) on delete set null;

create table if not exists inventory_members (
  inventory_id uuid not null references inventories(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null default 'editor' check (role in ('editor', 'viewer')),
  added_at     timestamptz not null default now(),
  primary key (inventory_id, user_id)
);

-- ---------- Helpers (security definer so RLS policies can call them cheaply) ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create or replace function can_access_inventory(inv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from inventories i where i.id = inv and i.owner_id = auth.uid())
      or exists (select 1 from inventory_members m where m.inventory_id = inv and m.user_id = auth.uid())
$$;

create or replace function can_edit_inventory(inv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from inventories i where i.id = inv and i.owner_id = auth.uid())
      or exists (select 1 from inventory_members m where m.inventory_id = inv and m.user_id = auth.uid() and m.role = 'editor')
$$;

create or replace function owns_inventory(inv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from inventories i where i.id = inv and i.owner_id = auth.uid())
$$;

-- ---------- Row Level Security ----------
-- Drop the old wide-open household policies.
drop policy if exists "household full access" on items;
drop policy if exists "household full access" on item_photos;
drop policy if exists "household full access" on inventories;
drop policy if exists "household full access" on api_cache;

alter table profiles          enable row level security;
alter table inventories       enable row level security;
alter table inventory_members enable row level security;
alter table items             enable row level security;
alter table item_photos       enable row level security;
alter table api_cache         enable row level security;

-- profiles: everyone signed in can see names/emails (needed to share by email);
-- only you or an admin can change your row; only admins can flip is_admin (enforced by trigger below).
create policy "profiles read"   on profiles for select to authenticated using (true);
create policy "profiles update" on profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create or replace function guard_profile_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null when run from the SQL editor / service role — allow that.
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null and not is_admin() then
    raise exception 'only an admin can change is_admin';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_admin on profiles;
create trigger profiles_guard_admin before update on profiles
  for each row execute function guard_profile_admin_flag();

-- inventories
create policy "inventories read"   on inventories for select to authenticated using (can_access_inventory(id));
create policy "inventories insert" on inventories for insert to authenticated with check (owner_id = auth.uid() or is_admin());
create policy "inventories update" on inventories for update to authenticated using (owns_inventory(id)) with check (owns_inventory(id));
create policy "inventories delete" on inventories for delete to authenticated using (owns_inventory(id));

-- members: owner/admin manage; members can see who else is on it
create policy "members read"   on inventory_members for select to authenticated using (can_access_inventory(inventory_id));
create policy "members insert" on inventory_members for insert to authenticated with check (owns_inventory(inventory_id));
create policy "members update" on inventory_members for update to authenticated using (owns_inventory(inventory_id));
create policy "members delete" on inventory_members for delete to authenticated using (owns_inventory(inventory_id));

-- items
create policy "items read"   on items for select to authenticated using (can_access_inventory(inventory_id));
create policy "items insert" on items for insert to authenticated with check (can_edit_inventory(inventory_id));
create policy "items update" on items for update to authenticated using (can_edit_inventory(inventory_id)) with check (can_edit_inventory(inventory_id));
create policy "items delete" on items for delete to authenticated using (can_edit_inventory(inventory_id));

-- photos (via their item)
create policy "photos read"   on item_photos for select to authenticated
  using (exists (select 1 from items i where i.id = item_id and can_access_inventory(i.inventory_id)));
create policy "photos insert" on item_photos for insert to authenticated
  with check (exists (select 1 from items i where i.id = item_id and can_edit_inventory(i.inventory_id)));
create policy "photos delete" on item_photos for delete to authenticated
  using (exists (select 1 from items i where i.id = item_id and can_edit_inventory(i.inventory_id)));

-- api_cache: only the API server touches this (service role bypasses RLS). No user policies.

-- storage: signed-in users can upload/delete in the photo bucket; public read stays (URLs are unguessable uuids).
drop policy if exists "household photo read"   on storage.objects;
drop policy if exists "household photo write"  on storage.objects;
drop policy if exists "household photo delete" on storage.objects;
create policy "photos public read" on storage.objects for select using (bucket_id = 'item-photos');
create policy "photos auth write"  on storage.objects for insert to authenticated with check (bucket_id = 'item-photos');
create policy "photos auth delete" on storage.objects for delete to authenticated using (bucket_id = 'item-photos');

-- export view follows the caller's RLS already (security_invoker).

-- ---------- Admin helper: list everything (bypasses RLS, admin-only) ----------
create or replace function admin_overview()
returns table (
  inventory_id uuid, inventory_name text, owner_email text, owner_id uuid,
  item_count bigint, member_count bigint, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, p.email, i.owner_id,
         (select count(*) from items it where it.inventory_id = i.id),
         (select count(*) from inventory_members m where m.inventory_id = i.id),
         i.created_at
  from inventories i left join profiles p on p.id = i.owner_id
  where is_admin()
  order by i.created_at
$$;

-- =====================================================================
-- STEP 2 — run AFTER you have signed up in the app. Replace the email.
-- =====================================================================
-- update profiles set is_admin = true where email = 'you@example.com';
-- update inventories set owner_id = (select id from profiles where email = 'you@example.com')
--   where owner_id is null;

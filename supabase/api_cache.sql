-- Persistent cache for third-party API responses (spot prices, PCGS lookups).
-- Run once in the Supabase SQL editor.

create table if not exists api_cache (
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table api_cache enable row level security;
create policy "household full access" on api_cache
  for all using (true) with check (true);

-- Optional: tidy expired rows now and then
create or replace function purge_api_cache() returns void as $$
  delete from api_cache where expires_at < now();
$$ language sql;

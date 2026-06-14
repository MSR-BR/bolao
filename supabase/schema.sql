-- Bolao Facil shared pools schema.
-- Run this once in the Supabase SQL editor for the project that will host the app.

create extension if not exists pgcrypto;

create table if not exists public.bolao_pools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^BOLAO-[A-Z0-9]{5}$'),
  title text not null default 'Bolão Fácil',
  admin_token_hash text not null,
  search_days integer not null default 7 check (search_days in (1, 3, 7)),
  selected_match_id text,
  selected_match jsonb,
  live_match jsonb,
  bets_closed boolean not null default false,
  bet_value numeric(12, 2) not null default 20,
  pix_key text not null default '',
  merchant_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bolao_participants (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.bolao_pools(id) on delete cascade,
  name text not null,
  home_goals integer not null default 0 check (home_goals between 0 and 20),
  away_goals integer not null default 0 check (away_goals between 0 and 20),
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bolao_pools_code_idx on public.bolao_pools (code);
create index if not exists bolao_participants_pool_created_idx
  on public.bolao_participants (pool_id, created_at);

create or replace function public.set_bolao_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bolao_pools_updated_at on public.bolao_pools;
create trigger set_bolao_pools_updated_at
before update on public.bolao_pools
for each row execute function public.set_bolao_updated_at();

drop trigger if exists set_bolao_participants_updated_at on public.bolao_participants;
create trigger set_bolao_participants_updated_at
before update on public.bolao_participants
for each row execute function public.set_bolao_updated_at();

alter table public.bolao_pools enable row level security;
alter table public.bolao_participants enable row level security;

-- The browser does not query these tables directly. The app server uses
-- SUPABASE_SERVICE_ROLE_KEY, compares the coordinator token hash, and returns
-- only the current bolao bundle by code.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.bolao_pools to service_role;
grant select, insert, update, delete on public.bolao_participants to service_role;

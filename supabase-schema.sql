-- Run this in Supabase: SQL Editor → New query → paste → Run

-- Chat messages (global)
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  username text not null,
  body text not null,
  created_at timestamptz default now()
);

-- Trades (offer / want)
create table if not exists public.trades (
  id bigint generated always as identity primary key,
  username text not null,
  offering text not null,
  wanting text not null,
  status text default 'open',
  created_at timestamptz default now()
);

-- Allow anyone to read and insert (anon key)
alter table public.messages enable row level security;
alter table public.trades enable row level security;

create policy "Allow read messages" on public.messages for select using (true);
create policy "Allow insert messages" on public.messages for insert with check (true);

create policy "Allow read trades" on public.trades for select using (true);
create policy "Allow insert trades" on public.trades for insert with check (true);

-- After running this, enable Realtime in Supabase Dashboard:
-- Database → Replication → find "messages" and "trades" and turn them ON for realtime.

-- ——— Google Auth setup ———
-- In Supabase Dashboard: Authentication → Providers → Google → enable and add your
-- Google OAuth Client ID and Secret (from console.cloud.google.com).
-- Add your site URL to Authentication → URL Configuration → Redirect URLs.

-- User progress (coins, luck, locked auras) — synced when signed in with Google
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint default 0,
  luck_multiplier numeric(20, 4) default 1,
  locked_storage jsonb default '[]',
  updated_at timestamptz default now()
);

alter table public.user_progress enable row level security;

create policy "Users read own progress" on public.user_progress
  for select using (auth.uid() = user_id);

create policy "Users insert own progress" on public.user_progress
  for insert with check (auth.uid() = user_id);

create policy "Users update own progress" on public.user_progress
  for update using (auth.uid() = user_id);

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

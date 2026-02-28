-- Rare rolls broadcast table
-- Run this once in Supabase SQL Editor.
-- Enable Realtime on this table in Supabase Dashboard → Database → Replication.

create table if not exists public.rare_rolls (
  id         bigint generated always as identity primary key,
  username   text,
  aura_text  text not null,
  aura_rarity bigint not null,
  aura_tier  text,
  font       text,
  color      text,
  font_weight text,
  font_style  text,
  text_shadow text,
  rolled_at  timestamptz default now()
);

alter table public.rare_rolls enable row level security;

-- Anyone (including anonymous players) can insert a rare roll
drop policy if exists "rare_rolls insert" on public.rare_rolls;
create policy "rare_rolls insert" on public.rare_rolls
  for insert with check (true);

-- Anyone can read (for leaderboard / bot)
drop policy if exists "rare_rolls read" on public.rare_rolls;
create policy "rare_rolls read" on public.rare_rolls
  for select using (true);

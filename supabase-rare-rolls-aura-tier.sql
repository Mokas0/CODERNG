-- Add aura_tier column to rare_rolls (used by Jerry for tier-specific announcements)
-- Run in Supabase SQL Editor if Jerry announcements fail with "column aura_tier does not exist".

alter table public.rare_rolls add column if not exists aura_tier text;

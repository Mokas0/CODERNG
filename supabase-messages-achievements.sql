-- Add achievement display columns to messages (for Sol's RNG-style titles next to name in chat)
-- Run in Supabase SQL Editor if you haven't already.

alter table public.messages add column if not exists achievement_emoji text;
alter table public.messages add column if not exists achievement_name text;

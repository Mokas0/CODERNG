-- Add achievement columns to messages for Sol's RNG-style display next to usernames in chat
-- Run in Supabase: SQL Editor → New query → paste → Run

alter table public.messages
  add column if not exists achievement_emoji text,
  add column if not exists achievement_name text;

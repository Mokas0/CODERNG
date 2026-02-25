-- ============================================================
-- Usernames — unique claim table
-- Run this once in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS usernames (
  username    text        primary key,
  token       text        not null,       -- device token stored in localStorage
  updated_at  timestamptz default now()
);

ALTER TABLE usernames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read usernames"   ON usernames FOR SELECT USING (true);
CREATE POLICY "Anon insert usernames"   ON usernames FOR INSERT  TO anon WITH CHECK (true);
CREATE POLICY "Anon update usernames"   ON usernames FOR UPDATE  TO anon USING (true);
CREATE POLICY "Anon delete usernames"   ON usernames FOR DELETE  TO anon USING (true);

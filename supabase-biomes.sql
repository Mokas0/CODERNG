-- ============================================================
-- Global Biomes — active_biome table
-- Run this once in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS active_biome (
  id          bigint generated always as identity primary key,
  biome_type  text        not null,   -- 'volcanic' | 'celestial' | 'void' | 'crystal' | 'storm'
  biome_name  text        not null,
  started_at  timestamptz default now(),
  ends_at     timestamptz not null
);

ALTER TABLE active_biome ENABLE ROW LEVEL SECURITY;

-- Anyone can read (frontend subscription)
CREATE POLICY "Allow public read active_biome"
  ON active_biome FOR SELECT USING (true);

-- Anon can insert (Jerry bot uses anon key)
CREATE POLICY "Allow anon insert active_biome"
  ON active_biome FOR INSERT TO anon WITH CHECK (true);

-- Enable Realtime so the frontend gets live biome events
ALTER PUBLICATION supabase_realtime ADD TABLE active_biome;

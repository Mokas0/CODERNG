-- ============================================================
-- Mayor Voting — weekly NPC mayor election
-- Run this once in the Supabase SQL Editor.
-- Players vote for 1 of 3 candidates per week. Winner's buff
-- scales with total votes received.
-- ============================================================

CREATE TABLE IF NOT EXISTS mayor_votes (
  id           bigint generated always as identity primary key,
  week_key     text        not null,   -- e.g. '2025-W10' (ISO week)
  mayor_id     text        not null,   -- id of the mayor voted for
  device_token text        not null,   -- unique per device, one vote per week
  created_at   timestamptz default now(),
  UNIQUE(week_key, device_token)
);

CREATE INDEX IF NOT EXISTS idx_mayor_votes_week ON mayor_votes(week_key);

ALTER TABLE mayor_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can read (to show live vote counts)
CREATE POLICY "Allow public read mayor_votes"
  ON mayor_votes FOR SELECT USING (true);

-- Anyone can insert (players vote)
CREATE POLICY "Allow public insert mayor_votes"
  ON mayor_votes FOR INSERT WITH CHECK (true);

-- Anyone can update (change vote before week ends - optional, we'll use upsert)
CREATE POLICY "Allow public update mayor_votes"
  ON mayor_votes FOR UPDATE USING (true) WITH CHECK (true);

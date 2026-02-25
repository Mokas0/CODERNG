-- ============================================================
-- Auto-trim chat messages — keep only the latest 50
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- Function called after every INSERT into messages
CREATE OR REPLACE FUNCTION trim_old_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM messages
  WHERE id NOT IN (
    SELECT id FROM messages
    ORDER BY created_at DESC
    LIMIT 50
  );
  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS auto_trim_messages ON messages;
CREATE TRIGGER auto_trim_messages
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION trim_old_messages();

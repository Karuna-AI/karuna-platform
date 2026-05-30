-- Migration 004: Performance & integrity cleanup
--
-- Three independent items, each idempotent and safe to re-run:
--   1. Add indexes on foreign-key columns that lack a supporting index. These
--      columns are filtered on every hot-path query (per-circle, per-user
--      lookups) and sequential scans are O(n) without the index.
--   2. Tighten NOT NULL on created_at columns that already have a default of
--      CURRENT_TIMESTAMP. The default means they're never actually NULL in
--      practice, but the missing constraint lets bad inserts slip through.
--   3. Record migration 003 in schema_migrations on databases where the schema
--      changes from 003 were applied by some other path (e.g. init.sql / the
--      careCircle.js startup ensure-table hook) before the migration runner
--      logged it. The runner skips files already in schema_migrations, so this
--      cannot double-apply.

-- 1. Foreign-key indexes
CREATE INDEX IF NOT EXISTS idx_invitations_circle_id ON invitations(circle_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_circle_id ON ai_usage_logs(circle_id);

-- 2. Tighten NOT NULL on timestamp columns (each guarded by a check so re-runs
--    on already-tight columns no-op cleanly).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='created_at' AND is_nullable='YES') THEN
    ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='admin_users' AND column_name='created_at' AND is_nullable='YES') THEN
    ALTER TABLE admin_users ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='care_circles' AND column_name='created_at' AND is_nullable='YES') THEN
    ALTER TABLE care_circles ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='invitations' AND column_name='created_at' AND is_nullable='YES') THEN
    ALTER TABLE invitations ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='password_reset_tokens' AND column_name='created_at' AND is_nullable='YES') THEN
    ALTER TABLE password_reset_tokens ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

-- 3. Backfill the schema_migrations entry for 003 if its changes are present
--    but its row isn't (ledger desync).
INSERT INTO schema_migrations (filename)
SELECT '003_backfill_verification_reset_schema.sql'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE filename = '003_backfill_verification_reset_schema.sql'
)
AND EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='users' AND column_name='email_verification_token_hash'
)
AND EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name='password_reset_tokens'
);

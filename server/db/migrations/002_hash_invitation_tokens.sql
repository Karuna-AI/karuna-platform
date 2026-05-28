-- Migration 002: Hash invitation tokens
-- The invite flow was hardened to store a SHA-256 hash of the invitation token
-- (column `token_hash`) instead of the raw token (legacy column `token`).
-- Fresh databases from init.sql already have `token_hash`, but databases created
-- before that change still have the plaintext `token` column, which makes the
-- invite/accept endpoints fail with a 500 ("column token_hash does not exist").
--
-- This migration upgrades those older databases. It is a no-op where `token_hash`
-- already exists. Pending invitations are expired because their raw tokens cannot
-- be recovered as hashes — affected users must be re-invited.

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'token'
     )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'token_hash'
     )
  THEN
    -- Old plaintext tokens are unusable under the new hashed-lookup scheme.
    UPDATE invitations SET status = 'expired' WHERE status = 'pending';

    ALTER TABLE invitations RENAME COLUMN token TO token_hash;
    ALTER TABLE invitations ALTER COLUMN token_hash TYPE VARCHAR(64) USING left(token_hash, 64);
  END IF;
END $$;

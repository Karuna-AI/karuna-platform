-- Migration 008 — token_version for session revocation on credential change.
--
-- users.token_version / admin_users.token_version are embedded in JWTs as the
-- `tv` claim at issue time. authMiddleware (care) and adminAuthMiddleware
-- reject any token whose `tv` no longer matches the stored version, so a
-- password change/reset immediately invalidates all previously issued
-- sessions. DEFAULT 1 keeps pre-existing rows and tokens valid.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

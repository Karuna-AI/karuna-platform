-- Migration 003: Backfill email-verification and password-reset schema
-- Databases created before the email-verification / password-reset hardening
-- are missing these user columns and the password_reset_tokens table. Fresh
-- databases (current init.sql) and the careCircle.js startup hook already have
-- them, so this migration is a no-op there. Without it, on older databases:
--   - registration 500s (INSERT into users.email_verification_token_hash), and
--   - the forgot/reset-password flow fails (missing reset columns + table).

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

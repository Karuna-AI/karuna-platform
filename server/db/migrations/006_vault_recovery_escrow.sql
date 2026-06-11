-- Migration 006 — caregiver-assisted vault PIN recovery escrow (H3 Phase 2).
--
-- The mobile vault uses a DEK (data encryption key) wrapped under the PIN-derived
-- key (H3 Phase 1). To support recovery when a user forgets their vault PIN, the
-- device also wraps the DEK under a random recovery key and escrows
-- { wrapped_dek, recovery_key } here, tied to the user + circle.
--
-- Recovery requires explicit approval by ANOTHER circle member (owner or a
-- caregiver) — the "caregiver-assisted" control — before the gateway releases the
-- material back to the requesting device. The recovery_key is itself encrypted at
-- rest by the gateway (AES-256-GCM under a key derived from JWT_SECRET), so a DB
-- dump alone does not reveal it. See docs/VAULT_PIN_RECOVERY_DESIGN.md.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS vault_recovery_escrow (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    circle_id     UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
    wrapped_dek   TEXT NOT NULL,                     -- DEK wrapped under the recovery key (device-side crypto)
    recovery_key  TEXT NOT NULL,                     -- recovery key, encrypted at rest by the gateway
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'pending', 'approved')),
    requested_at  TIMESTAMP WITH TIME ZONE,
    approved_by   UUID REFERENCES users(id),
    approved_at   TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, circle_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_recovery_escrow_circle ON vault_recovery_escrow(circle_id);
CREATE INDEX IF NOT EXISTS idx_vault_recovery_escrow_status ON vault_recovery_escrow(circle_id, status);

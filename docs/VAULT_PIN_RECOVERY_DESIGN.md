# Vault PIN Recovery — Caregiver-Assisted (H3)

Status: design + Phase 1 in progress (2026-06-01). Chosen approach: caregiver-assisted.

## Problem
The vault encryption key is derived **directly** from the user's PIN (`deriveKey(pin, salt)`).
A forgotten PIN = permanently unreadable vault. For Karuna's elderly / memory-impaired
users this is an expected event, not an edge case (see QA finding H3).

## Crypto constraint that shapes the design
Hermes/JSC have **no Web Crypto `subtle`** and the app has **no asymmetric-crypto**
primitive (the encryption layer already falls back to a SHA-256 keystream when subtle
is absent). So a zero-knowledge "encrypt the recovery key to the owner's public key"
escrow is not available without adding+auditing a pure-JS asymmetric library.

**Decision:** use **server-mediated escrow released on owner approval**, with symmetric
crypto only. Justification: post-H1 the vault already syncs to the server (the server
already holds doctors/medications/appointments/contacts), so the "device-only,
server-never-sees-it" property is already relaxed for synced data. Server-mediated
escrow is therefore consistent with the trust model already in place, and far simpler
and less risky than introducing asymmetric crypto on Hermes. (account/document remain
unsynced; recovery still re-keys them locally.)

## Phase 1 — DEK refactor (foundation, no behaviour change)  ← implementing now
Decouple the data key from the PIN so the PIN can change without re-encrypting data:
- On vault create: generate a random **DEK** (32 bytes, CSPRNG). Encrypt all vault data
  with the DEK. Store the DEK **wrapped** (encrypted) under the PIN-derived key:
  `wrappedDEK_pin`.
- On unlock: derive pinKey from PIN+salt → decrypt `wrappedDEK_pin` → DEK → use DEK for
  vault encrypt/decrypt.
- **Migration**: an existing vault has data encrypted directly under the PIN-key and no
  `wrappedDEK_pin`. On first unlock after upgrade: derive pinKey, decrypt the vault blob
  with pinKey (old path), generate a DEK, re-encrypt the blob under DEK, store
  `wrappedDEK_pin`. Idempotent and one-time.
- Changing the PIN now only re-wraps the DEK (no full re-encrypt).
- Verifiable entirely on-device + unit tests; no server/portal involved.

## Phase 2 — Escrow at setup
- On vault create (and for already-set-up vaults, lazily on next unlock once in a circle):
  wrap the DEK under a random **recoveryKey** → `wrappedDEK_recovery`; send
  `{ wrappedDEK_recovery, recoveryKey }` to the gateway over TLS. Server stores the
  escrow row keyed by user+circle, `recoveryKey` encrypted at rest by the server secret.
- New table `vault_recovery_escrow(user_id, circle_id, wrapped_dek, recovery_key_enc,
  created_at, status)`.

## Phase 3 — Recovery flow + portal approval
- Device: "Forgot PIN?" → "Ask your care circle to help" → POST recovery request.
- Server: mark request pending; notify the circle **owner** (the patient's account is
  owner; a trusted caregiver with `canApproveRecovery` may also be allowed).
- Portal: owner sees a pending request → **Approve** (with the requester identity + time).
- On approval: server releases `{ wrappedDEK_recovery, recoveryKey }` to the authenticated
  requesting device → device unwraps DEK → prompts for a **new PIN** → re-wraps DEK under
  the new pinKey. Vault readable again; no data lost.
- Audit every request/approval (ties into the existing Activity Log).

## Threat model / tradeoffs (explicit)
- Server (or anyone with DB + server secret) can decrypt an escrowed vault. Accepted:
  the server already stores synced vault data post-H1; recovery requires an explicit
  **owner approval** step (not silent), and all events are audited.
- A malicious caregiver who is the owner could approve their own recovery of the elder's
  vault. Mitigation: approval is logged + notified; only the circle owner (or an
  explicitly-granted role) can approve; consider a notification to the elder's device.

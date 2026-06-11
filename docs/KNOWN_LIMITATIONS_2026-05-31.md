# Known limitations & recommendations — 2026-05-31

The remaining items from the platform audit are infrastructure / ops / destructive
/ CI-only changes that should NOT be speculatively coded without the ability to
verify them against the real environment. Each is documented here with the
concrete fix and its trade-offs so it can be actioned deliberately.

## 1. WebSocket realtime does not survive horizontal scaling (gateway) — FIXED 2026-06-11

`server/realtime.js` now provides an **optional Redis adapter** (enabled by
setting `REDIS_URL`; see `.env.production.example`):
- `broadcastToCircle` fans out to other instances via Redis pub/sub (with
  self-suppression by instance id), so caregivers on any node receive events.
- WS tickets are stored in Redis with TTL and consumed atomically (Lua
  GET+DEL), so a ticket issued on node A works when the upgrade lands on node B.
- The archival job acquires a Redis advisory lock (6h TTL), so only one
  instance runs it per cycle.

Without `REDIS_URL` every path falls back to the previous single-instance
in-memory behavior — no operational change required. Verified live against a
real Redis with two simulated instances (cross-instance delivery,
self-suppression, shared one-shot tickets, TTL expiry, lock exclusivity) and
the full server suite passes without Redis (fallback path).

Remaining (acceptable): `/metrics` counters in `server/index.js` are still
per-instance; session-cleanup runs on every instance but is idempotent
(`DELETE ... WHERE expires_at < NOW()`).

## 2. Orphaned schema (DB)

- `vault_routines` (table + triggers), `system_metrics`, and
  `circle_members.notify_on_*` are defined but never read/written.

**Recommendation:** do NOT drop them reflexively in prod (destructive, and they
may be intended for near-term features). Decide per item:
- If a feature is planned (routines, per-member notify prefs) → wire them up.
- If not → remove via a dedicated, reviewed migration **after** confirming no
  external consumer. Leaving them is harmless but misleading; document intent.

## 3. No production super-admin bootstrap (ops)

`admin_tables.sql` seeds no super_admin (the seed block is comment-only); the only
path is `scripts/seed-admin.js`. If it isn't run on a fresh prod DB the admin
portal is unusable.

**Recommendation (ops, not a migration):** run `seed-admin.js` once per
environment with a **strong, secret** password supplied via env — never hardcode
admin credentials in a migration (that would ship known creds). Document this as a
required first-deploy step and store the password in the secret manager. Consider
adding account lockout beyond the existing 5/15-min IP limiter.

## 4. Deploy test gate runs mobile tests only (CI) — FIXED 2026-06-11

`deploy.yml`'s gate now mirrors `test.yml`: `postgres:16-alpine` service, schema
bootstrap (`init.sql` + `admin_tables.sql`), **migrations via
`server/db/migrations/run.js`**, then the full server suite before any deploy.
`test.yml` also gained the migrations step, so a broken migration fails CI on the
PR instead of at production deploy. The migration runner was verified locally
against a fresh schema (all 6 migrations apply cleanly); YAML validated.

## 5. Sync entity-type asymmetry (medium, code — deferred)

`document` is accepted by `POST /sync` but excluded from `GET /sync`
(push-only to the device); `note` is readable via `GET /sync` but not in the sync
`tableMap` (pull-only). Symmetrising these is a contained server+client change but
was de-scoped from this pass; track separately.

---

*Companion to `docs/PROD_DEPLOY_FIXES_2026-05-31.md`. All other audit findings
were fixed in PR #82.*

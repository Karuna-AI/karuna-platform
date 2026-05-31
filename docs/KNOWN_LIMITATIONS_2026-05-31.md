# Known limitations & recommendations — 2026-05-31

The remaining items from the platform audit are infrastructure / ops / destructive
/ CI-only changes that should NOT be speculatively coded without the ability to
verify them against the real environment. Each is documented here with the
concrete fix and its trade-offs so it can be actioned deliberately.

## 1. WebSocket realtime does not survive horizontal scaling (gateway)

**What:** `wsClients`, `wsTickets`, and `metrics` are module-level in-memory Maps,
and session-cleanup / archival run as bare `setInterval`s (`server/index.js`,
`server/careCircle.js`). With **one** Railway instance this is fine (current
state). With **>1** replica:
- `broadcastToCircle` only reaches clients connected to the **same** node, so a
  caregiver on node A misses an `alert`/`health_update` emitted on node B.
- A ws-ticket issued on node A fails when the upgrade lands on node B.
- Archival/session-cleanup run redundantly (mostly idempotent, but no leader lock).

**Fix (when scaling past 1 instance):** introduce a shared pub/sub + store —
Redis (`ioredis`): publish circle broadcasts to a Redis channel each node
subscribes to; store ws-tickets in Redis with TTL; gate the archival interval
behind a Redis advisory lock (or move it to a scheduled one-off job). Until then,
**pin the gateway to a single instance** and note this in the Railway config.

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

## 4. Deploy test gate runs mobile tests only (CI)

`deploy.yml`'s gate runs the mobile coverage suite with
`--testPathIgnorePatterns=__tests__/server` and **no Postgres service**, so a
server regression can ship even though `test.yml` (PR/push) runs the full server
suite.

**Recommendation:** make the deploy gate run the **same** server-test job as
`test.yml` — add the `postgres:16-alpine` service, bootstrap the DB
(`init.sql` + `admin_tables.sql` + `run.js`), and run the server tests — OR gate
the deploy on the `test.yml` workflow's success via `workflow_run`. Not changed
blindly here because a YAML mistake would block all deploys and can't be verified
without running CI; do it in a PR where CI validates it.

## 5. Sync entity-type asymmetry (medium, code — deferred)

`document` is accepted by `POST /sync` but excluded from `GET /sync`
(push-only to the device); `note` is readable via `GET /sync` but not in the sync
`tableMap` (pull-only). Symmetrising these is a contained server+client change but
was de-scoped from this pass; track separately.

---

*Companion to `docs/PROD_DEPLOY_FIXES_2026-05-31.md`. All other audit findings
were fixed in PR #82.*

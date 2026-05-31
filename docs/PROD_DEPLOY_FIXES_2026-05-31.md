# Prod deploy & dashboard fixes — 2026-05-31

Diagnosed while verifying the mobile sync fix on a real device. Three independent
issues were blocking the production dashboards and the CI deploy pipeline.

## 1. Dashboards non-functional in prod — missing `/api` proxy (FIXED in repo)

**Symptom:** `caregiver-portal-ten.vercel.app` loads but login never works; the
caregiver portal even renders the dashboard shell to an unauthenticated browser.

**Root cause:** the portal bundles call **relative** `/api/*`, expecting a
same-origin proxy to the gateway. Locally this works because Vite's dev server
proxies `/api` (see `caregiver-portal/vite.config.ts`). In production the
`vercel.json` only had a SPA catch-all (`/(.*) → /index.html`), so `/api/*`
requests were rewritten to `index.html` and returned the SPA HTML
(`HTTP 405 text/html`) instead of reaching the gateway. Verified:

```
POST https://caregiver-portal-ten.vercel.app/api/care/auth/login → 405 text/html
```

**Fix (committed):** added an `/api` rewrite *before* the SPA catch-all in both
`caregiver-portal/vercel.json` and `admin-portal/vercel.json`:

```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "https://karuna-gateway-production.up.railway.app/api/$1" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

Server-side proxy → no CORS needed; cookies (admin httpOnly) and Bearer
(caregiver) both stay same-origin, matching the local Vite-proxy behaviour.

**Verify after redeploy:** `POST /api/care/auth/login` should return JSON
(`401` on bad creds), and caregiver login should load the user's circles.

**Note — WebSocket:** Vercel rewrites don't reliably proxy `/ws`. The caregiver
portal has a 30s polling fallback, so data still flows; real-time push over the
portal may need the WS to connect to the gateway's absolute `wss://` URL.

## 2. Admin portal CI deploy fails every run — Vercel Root Directory doubling

**Symptom:** `Deploy Admin Portal to Vercel` job fails on every master push
(caregiver job succeeds).

**Root cause (confirmed from the run log):**
```
Error: The provided path ".../admin-portal/admin-portal" does not exist.
To change your Project Settings, go to https://vercel.com/karunaais-projects/admin-portal/settings
```
The **admin-portal** Vercel project has **Root Directory = `admin-portal`**, and
the workflow step also `cd`s into `./admin-portal` (`working-directory`), so the
path doubles to `admin-portal/admin-portal`. The caregiver project has an empty
Root Directory, which is why the identical caregiver job works.

**Fix (Vercel dashboard — 1 click, requires `karunaais-projects` access):**
Open https://vercel.com/karunaais-projects/admin-portal/settings → Build &
Deployment → **clear the "Root Directory" field** (leave empty). The committed
`admin-portal/.vercel/project.json` + the workflow's `working-directory:
./admin-portal` then resolve correctly, exactly like the caregiver project.

The repo workflow itself is correct and was not changed.

## 3. Missing GitHub Actions secrets / variables

`gh secret list` / `gh variable list` show the deploy pipeline is only partly
configured. Present: `API_URL`, `PREVIEW_API_URL`, `VERCEL_TOKEN`.

**Missing (deploy.yml references these) — set in repo Settings → Secrets and variables → Actions:**

| Name | Type | Used by | Notes |
|------|------|---------|-------|
| `RAILWAY_TOKEN` | secret | Deploy Backend | project-scoped token (or pair with `RAILWAY_PROJECT_ID`) |
| `RAILWAY_SERVICE_ID` | secret | Deploy Backend | `karuna-gateway` service id |
| `VERCEL_ORG_ID` | **variable** | both portal deploys | `team_7ULiUfLFChnUIoAD6zBQLjfk` (karunaais-projects) |
| `VERCEL_PROJECT_ID_CAREGIVER` | **variable** | caregiver deploy | `prj_CfLolYJOf5rSqgK6L9sOBeyKtxnl` |
| `VERCEL_PROJECT_ID_ADMIN` | **variable** | admin deploy | `prj_l2qoZ8Fpd6CNXclq4JNlPFszUKJX` |
| `KARUNA_PORTAL_URL` / `KARUNA_ADMIN_URL` / `KARUNA_API_URL` | secret | smoke tests | prod URLs |

Note: the portal deploys currently succeed *despite* the missing `vars.*`
because each portal commits a `.vercel/project.json` linking the project. Set
the variables anyway for correctness and to keep the smoke-test job working.

## Current prod state (2026-05-31)

- **Railway gateway** — healthy, running `origin/master`.
- **Caregiver portal** — live; `/api` proxy fix committed, needs redeploy.
- **Admin portal** — CI deploy failing until Root Directory is cleared.
- Vercel team is **karunaais-projects** (not the `sreejagatab` personal account).

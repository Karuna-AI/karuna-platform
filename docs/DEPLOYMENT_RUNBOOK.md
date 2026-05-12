# Karuna Platform – Deployment Runbook

## Overview

This runbook covers deploying the Karuna platform to production. The platform consists of:

- **API Server** – Node.js/Express in `server/`
- **Caregiver Portal** – Vite/React SPA in `caregiver-portal/`
- **Admin Portal** – Vite/React SPA in `admin-portal/`
- **Mobile App** – Expo/React Native (deployed separately via EAS)
- **Database** – PostgreSQL 16

All server-side components are Docker-composed behind an Nginx reverse proxy.

---

## Prerequisites

- Docker ≥ 24 and Docker Compose ≥ 2.20 installed on the host
- Node.js 20.x installed (for building portals and running migrations)
- `RESEND_API_KEY`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `OPENAI_API_KEY` environment variables available
- DNS records pointing to the server IP for `app.karunaapp.in` and `admin.karunaapp.in`
- SSL certificates provisioned via Let's Encrypt (Certbot container handles renewal)

---

## Environment Setup

```bash
# 1. Copy and fill the env file
cp .env.production.example .env
# Edit .env — fill in all required values before proceeding

# Required variables:
# DB_USER, DB_PASSWORD, DB_NAME
# JWT_SECRET            (≥32 random chars)
# ADMIN_JWT_SECRET      (≥32 random chars, different from JWT_SECRET)
# OPENAI_API_KEY
# OPENROUTER_API_KEY
# CORS_ORIGIN           (e.g. https://app.karunaapp.in)
# RESEND_API_KEY
# FROM_EMAIL            (e.g. Karuna <noreply@karunaapp.in>)
# SENTRY_DSN            (optional but recommended)
```

---

## Deployment Steps

### Step 1 – Run Tests

Tests must pass before any deploy. The CI pipeline enforces this, but for manual deploys:

```bash
cd /path/to/karuna2026
npm run test:coverage -- --runInBand --testPathIgnorePatterns='__tests__/server'
```

Do not proceed if any test fails.

### Step 2 – Build the Portals

```bash
# Caregiver portal
cd caregiver-portal
npm ci
npm run build
cd ..

# Admin portal
cd admin-portal
npm ci
npm run build
cd ..
```

Built static files land in `caregiver-portal/dist/` and `admin-portal/dist/`.

### Step 3 – Run Database Migrations

```bash
cd server
node db/migrations/run.js
cd ..
```

Migrations are idempotent (tracked in `schema_migrations` table). See Task #51 / `server/db/migrations/` for details.

### Step 4 – Start / Update the Stack

**First deploy (fresh server):**

```bash
docker compose -f docker-compose.production.yml up -d --build
```

**Subsequent deploys (rolling update):**

```bash
# Rebuild only the API image if server code changed
docker compose -f docker-compose.production.yml up -d --build api

# Nginx serving the portals picks up the new dist/ automatically on restart
docker compose -f docker-compose.production.yml restart caregiver-portal admin-portal nginx
```

### Step 5 – Verify Health

```bash
# API health check
curl -sf https://app.karunaapp.in/api/health && echo "API OK"

# Admin portal reachable
curl -sf -o /dev/null -w "%{http_code}" https://admin.karunaapp.in/

# Check container status
docker compose -f docker-compose.production.yml ps

# Tail API logs for errors
docker logs karuna-api --tail=50 --follow
```

### Step 6 – Smoke Test

Manually verify the following after every deploy:

- [ ] Login works on caregiver portal
- [ ] Login works on admin portal
- [ ] Admin dashboard loads with data (auto-refresh counter visible)
- [ ] Health alerts page renders
- [ ] Feature flags page renders and toggles save
- [ ] Mobile app connects to API (check `/api/health` from device)

---

## Rollback

```bash
# Stop the stack
docker compose -f docker-compose.production.yml down

# Restore previous portal builds from backup (if git-based, just checkout previous tag)
git checkout <previous-tag>
cd caregiver-portal && npm ci && npm run build && cd ..
cd admin-portal && npm ci && npm run build && cd ..

# Restart with the previous API image
docker compose -f docker-compose.production.yml up -d --build
```

For database rollbacks, use the backup restored from `/backups/` (Postgres volume is bind-mounted there):

```bash
# Restore from a pg_dump backup
docker exec -i karuna-postgres psql -U $DB_USER -d $DB_NAME < /backups/karuna_YYYY-MM-DD.sql
```

---

## Mobile App Deployment (EAS)

The Expo mobile app is deployed separately via EAS Build / Submit.

```bash
# Build production iOS binary
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios --latest

# Build + Submit Android
eas build --platform android --profile production
eas submit --platform android --latest
```

Ensure `eas.json` and `app.config.js` have the correct `bundleIdentifier` / `package` and version before submitting.

---

## SSL Certificate Renewal

Certbot renews certificates automatically every 12 hours via the `certbot` Docker service. To force renewal manually:

```bash
docker compose -f docker-compose.production.yml run --rm certbot renew
docker compose -f docker-compose.production.yml restart nginx
```

---

## Database Backups

Schedule daily backups with cron on the host:

```bash
# Add to crontab: daily at 02:00
0 2 * * * docker exec karuna-postgres pg_dump -U $DB_USER $DB_NAME | gzip > /backups/karuna_$(date +\%F).sql.gz
# Keep 30 days of backups
0 3 * * * find /backups -name "*.sql.gz" -mtime +30 -delete
```

---

## Secrets Rotation

When rotating `JWT_SECRET` or `ADMIN_JWT_SECRET`:

1. Update `.env` with the new secret.
2. Restart the API: `docker compose -f docker-compose.production.yml restart api`
3. All existing sessions will be invalidated — users must log in again. Notify users in advance.

When rotating `DB_PASSWORD`:

1. Update the password in PostgreSQL: `ALTER USER karuna_user PASSWORD 'new-password';`
2. Update `.env` → `DB_PASSWORD`.
3. Restart the API.

---

## Monitoring

- **Logs:** `docker logs karuna-api --follow`
- **Sentry:** Configure `SENTRY_DSN` in `.env` for crash reporting (see Task #52)
- **Uptime:** Use an external monitor (e.g. UptimeRobot) targeting `https://app.karunaapp.in/api/health`

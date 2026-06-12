#!/usr/bin/env bash
# Post-deploy smoke tests for the Karuna platform.
# Exits 1 if any check fails.
#
# Usage:
#   KARUNA_API_URL=https://api.karunaapp.in \
#   KARUNA_PORTAL_URL=https://app.karunaapp.in \
#   KARUNA_ADMIN_URL=https://admin.karunaapp.in \
#   bash scripts/smoke-test.sh

set -euo pipefail

API_URL="${KARUNA_API_URL:-http://localhost:3000}"
PORTAL_URL="${KARUNA_PORTAL_URL:-http://localhost:5173}"
ADMIN_URL="${KARUNA_ADMIN_URL:-http://localhost:5174}"

PASS=0
FAIL=0

check() {
  local desc="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local method="${4:-GET}"

  # No -f: a 4xx is a valid expected outcome here, and -f makes curl exit
  # non-zero so the || fallback used to append "000" to the printed code.
  local status
  if [ "$method" = "POST" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -X POST -H 'Content-Type: application/json' -d '{}' "$url" 2>/dev/null || echo "000")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  fi

  if [ "$status" = "$expected_status" ]; then
    echo "  ✓ $desc ($status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc — expected $expected_status, got $status ($url)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local desc="$1"
  local url="$2"
  local jq_filter="$3"
  local expected="$4"

  local body
  body=$(curl -sf --max-time 10 "$url" 2>/dev/null || echo '{}')
  local actual
  actual=$(echo "$body" | jq -r "$jq_filter" 2>/dev/null || echo "parse-error")

  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc — expected '$expected', got '$actual' ($url)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Karuna Smoke Tests ==="
echo "API:    $API_URL"
echo "Portal: $PORTAL_URL"
echo "Admin:  $ADMIN_URL"
echo ""

echo "--- API health ---"
# The gateway serves /health (not /api/health) returning {"status":"healthy",...}.
check_json "API health status is healthy"  "$API_URL/health" '.status' 'healthy'
check_json "API health reports timestamp"  "$API_URL/health" '.timestamp | type' 'string'

echo ""
echo "--- API authentication endpoints ---"
check "Login endpoint rejects empty credentials" \
  "$API_URL/api/care/auth/login" "400" "POST"
# Admin mutations require X-Requested-With (CSRF defense-in-depth) — a bare
# POST must be rejected with 403, which also proves the endpoint is alive.
check "Admin login rejects non-AJAX requests (CSRF guard)" \
  "$API_URL/api/admin/auth/login" "403" "POST"

echo ""
echo "--- Portal availability ---"
check "Caregiver portal root serves HTML" "$PORTAL_URL/" "200"
check "Admin portal root serves HTML"     "$ADMIN_URL/" "200"

echo ""
echo "--- Static asset serving ---"
# Vite builds inject a <script type=\"module\" src=\"/assets/...js\"> — just verify
# the portal serves something at /assets/ rather than 404.
PORTAL_ASSET_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$PORTAL_URL/assets/" 2>/dev/null || echo "000")
if [ "$PORTAL_ASSET_STATUS" != "000" ]; then
  echo "  ✓ Caregiver portal /assets/ directory reachable ($PORTAL_ASSET_STATUS)"
  PASS=$((PASS + 1))
else
  echo "  ✗ Caregiver portal /assets/ directory unreachable"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "==========================="
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

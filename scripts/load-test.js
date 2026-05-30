/**
 * Karuna Gateway Load Test — k6
 *
 * Usage:
 *   k6 run scripts/load-test.js
 *   k6 run --env BASE_URL=https://karuna-api-production.up.railway.app scripts/load-test.js
 *
 * Targets 1000 concurrent virtual users (VUs) across 3 stages:
 *   - Ramp to 1000 VUs over 2 min
 *   - Hold 1000 VUs for 5 min
 *   - Ramp down over 1 min
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@karunaapp.in';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || '';

export const options = {
  stages: [
    { duration: '2m', target: 200 },   // Warm up
    { duration: '2m', target: 1000 },  // Ramp to peak
    { duration: '5m', target: 1000 },  // Hold peak
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // 95th-percentile response time under 500ms
    http_req_duration: ['p(95)<500'],
    // Error rate below 1%
    error_rate: ['rate<0.01'],
    // Health endpoint must always succeed
    'health_check_success': ['rate>0.999'],
  },
  // Graceful stop
  gracefulStop: '30s',
};

// ──────────────────────────────────────────────────────────────
// Custom metrics
// ──────────────────────────────────────────────────────────────

const errorRate     = new Rate('error_rate');
const healthSuccess = new Rate('health_check_success');
const aiLatency     = new Trend('ai_endpoint_latency');
const authLatency   = new Trend('auth_endpoint_latency');
const totalRequests = new Counter('total_requests');

const HEADERS_JSON = { 'Content-Type': 'application/json' };

// ──────────────────────────────────────────────────────────────
// Scenario helpers
// ──────────────────────────────────────────────────────────────

function checkHealth() {
  group('Health check', () => {
    const res = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health body ok':    (r) => r.json('status') === 'ok',
    });
    healthSuccess.add(ok);
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

function exerciseAuthFlow() {
  group('Auth: register attempt (expect 409 on duplicate)', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/care/auth/register`,
      JSON.stringify({
        email: `loadtest_${__VU}_${Date.now()}@karuna-test.invalid`,
        password: 'LoadTest!2026',
        name: `Load Test User ${__VU}`,
      }),
      { headers: HEADERS_JSON, timeout: '10s' }
    );
    authLatency.add(Date.now() - start);
    // 201 created or 409 duplicate or 429 rate limited — all acceptable
    const ok = check(res, {
      'register: acceptable status': (r) => [201, 400, 409, 429].includes(r.status),
    });
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

function exerciseLoginFlow() {
  group('Auth: login (expected 401 with fake creds)', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/care/auth/login`,
      JSON.stringify({ email: 'nonexistent@karuna-test.invalid', password: 'WrongPass!1' }),
      { headers: HEADERS_JSON, timeout: '10s' }
    );
    authLatency.add(Date.now() - start);
    const ok = check(res, {
      'login: 401 or 429': (r) => [401, 429].includes(r.status),
    });
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

function exerciseForgotPassword() {
  group('Auth: forgot-password (always 200)', () => {
    const res = http.post(
      `${BASE_URL}/api/care/auth/forgot-password`,
      JSON.stringify({ email: 'nobody@karuna-test.invalid' }),
      { headers: HEADERS_JSON, timeout: '10s' }
    );
    const ok = check(res, {
      'forgot-password 200 or 429': (r) => [200, 429].includes(r.status),
    });
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

function exerciseFeatureFlags() {
  group('Feature flags endpoint', () => {
    const res = http.get(`${BASE_URL}/api/feature-flags`, { timeout: '5s' });
    const ok = check(res, {
      'feature-flags 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

function exerciseAdminLogin() {
  if (!ADMIN_PASSWORD) return;

  group('Admin auth login', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/admin/auth/login`,
      JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      { headers: HEADERS_JSON, timeout: '10s' }
    );
    authLatency.add(Date.now() - start);
    const ok = check(res, {
      'admin login 200 or 401 or 429': (r) => [200, 401, 429].includes(r.status),
    });
    errorRate.add(!ok);
    totalRequests.add(1);
  });
}

// ──────────────────────────────────────────────────────────────
// Main scenario: mix of requests to simulate real traffic
// ──────────────────────────────────────────────────────────────

export default function () {
  // Every VU hits health on each iteration
  checkHealth();
  sleep(0.1);

  // Distribute load across different endpoint types
  const scenario = (__VU + __ITER) % 5;

  switch (scenario) {
    case 0:
      exerciseLoginFlow();
      break;
    case 1:
      exerciseForgotPassword();
      break;
    case 2:
      exerciseFeatureFlags();
      break;
    case 3:
      exerciseAuthFlow();
      break;
    case 4:
      exerciseAdminLogin();
      break;
  }

  // Think time: 0.5–1.5s between iterations (simulates human-paced usage)
  sleep(0.5 + Math.random());
}

// ──────────────────────────────────────────────────────────────
// Setup: called once before the test
// ──────────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`Health check failed before load test: ${res.status} — is the server running at ${BASE_URL}?`);
  }
  console.log(`Load test target: ${BASE_URL}`);
  return { baseUrl: BASE_URL };
}

// ──────────────────────────────────────────────────────────────
// Teardown: called once after the test
// ──────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`Load test complete against ${data.baseUrl}`);
}

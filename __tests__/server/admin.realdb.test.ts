/**
 * @jest-environment node
 *
 * Real PostgreSQL integration tests for the Karuna Admin API.
 * Connects to the real karuna_test database — no mocks for DB.
 *
 * Prerequisites:
 *   1. PostgreSQL running on localhost:5437
 *   2. karuna_test database created and migrated:
 *        psql -U karuna -d karuna_test -f server/db/init.sql
 *        psql -U karuna -d karuna_test -f server/db/admin_tables.sql
 *
 * Coverage:
 *   ✔ Admin Auth — login (success/fail), /me (auth + unauth)
 *   ✔ User Management — list, search, create, suspend, unsuspend
 *   ✔ Feature Flags — list, create, update, delete
 *   ✔ Health Alerts — list, overview
 *   ✔ Audit Logs — user audit logs, admin audit logs
 *   ✔ Circles — paginated list
 */

// ── Speed up bcrypt in tests (1 round instead of 12) ─────────────────────────
jest.mock('../../server/node_modules/bcryptjs', () => {
  const real = jest.requireActual('../../server/node_modules/bcryptjs');
  return {
    ...real,
    hash: (password: string) => Promise.resolve(real.hashSync(password, 1)),
    compare: (password: string, hash: string) => Promise.resolve(real.compareSync(password, hash)),
    hashSync: (password: string) => real.hashSync(password, 1),
    compareSync: (password: string, hash: string) => real.compareSync(password, hash),
  };
});

// ── Prevent real OpenAI/OpenRouter calls ─────────────────────────────────────
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: {
      choices: [{ message: { content: 'Hello from mock AI' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    },
  }),
  create: jest.fn(() => ({ post: jest.fn(), get: jest.fn() })),
}));

import supertest from 'supertest';

// ── Runtime references ────────────────────────────────────────────────────────
let req: ReturnType<typeof supertest>;
let db: any;

// Admin credentials created in beforeAll
let adminEmail: string;
let adminId: string;
const ADMIN_PASSWORD = 'AdminTest999!';
let adminJwt: string;   // Bearer JWT from login response — no CSRF needed

// ── App setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Must be set BEFORE any server module is required (module-level const reads)
  process.env.DATABASE_URL = 'postgresql://karuna:ganesh@localhost:5437/karuna_test';
  process.env.JWT_SECRET = 'realdb-test-jwt-secret-at-least-32ch!!';
  process.env.ADMIN_JWT_SECRET = 'realdb-test-admin-jwt-secret-32ch!!';
  process.env.NODE_ENV = 'test';
  process.env.VAULT_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes as hex

  db = require('../../server/db');

  const express      = require('../../server/node_modules/express');
  const cors         = require('../../server/node_modules/cors');
  const helmet       = require('../../server/node_modules/helmet');
  const { router: adminRouter } = require('../../server/admin');

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/admin', adminRouter);

  req = supertest(app);

  // Allow module-level async initialization in admin.js to settle
  await new Promise((r) => setTimeout(r, 300));

  // ── Clean any leftover test data from prior runs ──────────────────────────
  await db.query("DELETE FROM admin_audit_logs WHERE admin_email LIKE '%@admintest.karuna'");
  await db.query("DELETE FROM admin_users WHERE email LIKE '%@admintest.karuna'");
  await db.query("DELETE FROM feature_flags WHERE name LIKE 'test_flag_%'");
  await db.query("DELETE FROM users WHERE email LIKE '%@admintest.karuna'");

  // ── Create one super_admin for all tests ─────────────────────────────────
  const bcryptForSetup = require('../../server/node_modules/bcryptjs');
  adminEmail = `super-admin-${Date.now()}@admintest.karuna`;
  const adminHash = bcryptForSetup.hashSync(ADMIN_PASSWORD, 1);
  const adminInsert = await db.query(
    `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, 'Test Super Admin', 'super_admin') RETURNING id`,
    [adminEmail, adminHash]
  );
  adminId = adminInsert.rows[0].id;

  // Login to get the JWT — using Bearer so no CSRF cookie needed for mutations
  const loginRes = await req.post('/api/admin/auth/login')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ email: adminEmail, password: ADMIN_PASSWORD });

  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed in beforeAll: ${JSON.stringify(loginRes.body)}`);
  }
  adminJwt = loginRes.body.token;
}, 30_000);

afterAll(async () => {
  if (adminId) {
    await db.query("DELETE FROM admin_audit_logs WHERE admin_id = $1", [adminId]);
    await db.query("DELETE FROM admin_users WHERE id = $1", [adminId]);
  }
  await db.query("DELETE FROM feature_flags WHERE name LIKE 'test_flag_%'");
  await db.query("DELETE FROM users WHERE email LIKE '%@admintest.karuna'");
  await db.close();
}, 15_000);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════════════════

describe('Admin Auth', () => {
  describe('POST /api/admin/auth/login', () => {
    it('returns 200 and sets token cookie on correct credentials', async () => {
      const res = await req.post('/api/admin/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: adminEmail, password: ADMIN_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.admin.email).toBe(adminEmail);
      expect(res.body.admin.role).toBe('super_admin');

      // Should set a cookie
      const cookies: string[] = res.headers['set-cookie'] || [];
      expect(cookies.length).toBeGreaterThan(0);
    });

    it('returns 401 on wrong password', async () => {
      const res = await req.post('/api/admin/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: adminEmail, password: 'completely-wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('returns 401 for unknown email', async () => {
      const res = await req.post('/api/admin/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: 'nobody@admintest.karuna', password: ADMIN_PASSWORD });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when email or password is missing', async () => {
      const res = await req.post('/api/admin/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: adminEmail });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/auth/me', () => {
    it('returns 200 with admin info when authenticated via Bearer', async () => {
      const res = await req.get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.admin).toBeDefined();
      expect(res.body.admin.email).toBe(adminEmail);
      expect(res.body.admin.role).toBe('super_admin');
      expect(res.body.admin.permissions).toBeDefined();
      // password_hash must not be leaked
      expect(res.body.admin.password_hash).toBeUndefined();
    });

    it('returns 401 without token', async () => {
      const res = await req.get('/api/admin/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const res = await req.get('/api/admin/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');
      expect(res.status).toBe(401);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('User Management', () => {
  let createdUserId: string;
  const uniqueSuffix = Date.now();

  describe('GET /api/admin/users', () => {
    it('returns paginated list of users', async () => {
      const res = await req.get('/api/admin/users')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(typeof res.body.pagination.total).toBe('number');
      expect(typeof res.body.pagination.page).toBe('number');
      expect(typeof res.body.pagination.limit).toBe('number');
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    it('returns at most 500 rows when limit=999999', async () => {
      const res = await req.get('/api/admin/users?limit=999999')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
      expect(res.body.users.length).toBeLessThanOrEqual(500);
    });
  });

  describe('GET /api/admin/users?search=', () => {
    it('filters results by email/name search term', async () => {
      // Seed a user we know will match
      const searchEmail = `search-target-${uniqueSuffix}@admintest.karuna`;
      const bcrypt = require('../../server/node_modules/bcryptjs');
      await db.query(
        `INSERT INTO users (email, password_hash, name, is_verified) VALUES ($1, $2, 'SearchTarget User', true)`,
        [searchEmail, bcrypt.hashSync('Pass123!', 1)]
      );

      const res = await req.get(`/api/admin/users?search=search-target-${uniqueSuffix}`)
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.some((u: any) => u.email === searchEmail)).toBe(true);

      // A totally different search term should not return this user
      const noMatchRes = await req.get('/api/admin/users?search=xyzthisdoesnotexist999')
        .set('Authorization', `Bearer ${adminJwt}`);
      expect(noMatchRes.status).toBe(200);
      expect(noMatchRes.body.users.some((u: any) => u.email === searchEmail)).toBe(false);
    });
  });

  describe('POST /api/admin/users', () => {
    it('creates a user and returns tempPassword', async () => {
      const newEmail = `provisioned-${uniqueSuffix}@admintest.karuna`;
      const res = await req.post('/api/admin/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: newEmail, name: 'Provisioned User' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(newEmail);
      expect(res.body.user.is_verified).toBe(true);
      expect(res.body.tempPassword).toBeDefined();
      expect(typeof res.body.tempPassword).toBe('string');
      expect(res.body.tempPassword.length).toBeGreaterThanOrEqual(12);

      createdUserId = res.body.user.id;

      // Verify in DB
      const row = await db.query('SELECT email, is_verified FROM users WHERE id = $1', [createdUserId]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].is_verified).toBe(true);
    });

    it('returns 409 for duplicate email', async () => {
      const dupEmail = `provisioned-${uniqueSuffix}@admintest.karuna`;
      const res = await req.post('/api/admin/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: dupEmail, name: 'Duplicate User' });

      expect(res.status).toBe(409);
    });

    it('returns 400 when name is missing', async () => {
      const res = await req.post('/api/admin/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ email: `noname-${uniqueSuffix}@admintest.karuna` });

      expect(res.status).toBe(400);
    });

    it('returns 403 when X-Requested-With header is absent', async () => {
      const res = await req.post('/api/admin/users')
        .set('Authorization', `Bearer ${adminJwt}`)
        .send({ email: `noheader-${uniqueSuffix}@admintest.karuna`, name: 'No Header' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/admin/users/:id/suspend', () => {
    it('sets is_active=false and creates audit log', async () => {
      expect(createdUserId).toBeDefined();

      const res = await req.post(`/api/admin/users/${createdUserId}/suspend`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Integration test suspension' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB
      const row = await db.query(
        'SELECT is_active, suspended_at, suspended_reason FROM users WHERE id = $1',
        [createdUserId]
      );
      expect(row.rows[0].is_active).toBe(false);
      expect(row.rows[0].suspended_at).not.toBeNull();
      expect(row.rows[0].suspended_reason).toBe('Integration test suspension');

      // Audit log should exist
      const auditRow = await db.query(
        "SELECT action FROM admin_audit_logs WHERE resource_id = $1 AND action = 'suspend_user' LIMIT 1",
        [createdUserId]
      );
      expect(auditRow.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 400 when reason is missing', async () => {
      const res = await req.post(`/api/admin/users/${createdUserId}/suspend`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await req.post(`/api/admin/users/${fakeId}/suspend`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Does not exist' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/users/:id/unsuspend', () => {
    it('sets is_active=true and clears suspended_at', async () => {
      expect(createdUserId).toBeDefined();

      const res = await req.post(`/api/admin/users/${createdUserId}/unsuspend`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB
      const row = await db.query(
        'SELECT is_active, suspended_at FROM users WHERE id = $1',
        [createdUserId]
      );
      expect(row.rows[0].is_active).toBe(true);
      expect(row.rows[0].suspended_at).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Feature Flags', () => {
  let createdFlagId: string;
  const flagName = `test_flag_${Date.now()}`;

  describe('GET /api/admin/feature-flags', () => {
    it('returns array of flags', async () => {
      const res = await req.get('/api/admin/feature-flags')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.flags)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/feature-flags');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/feature-flags', () => {
    it('creates a new feature flag', async () => {
      const res = await req.post('/api/admin/feature-flags')
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: flagName,
          description: 'Integration test flag',
          is_enabled: false,
          enabled_for_all: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flag).toBeDefined();
      expect(res.body.flag.name).toBe(flagName);
      expect(res.body.flag.is_enabled).toBe(false);

      createdFlagId = res.body.flag.id;

      // Verify in DB
      const row = await db.query('SELECT name FROM feature_flags WHERE id = $1', [createdFlagId]);
      expect(row.rows[0].name).toBe(flagName);
    });

    it('returns 400 when name is missing', async () => {
      const res = await req.post('/api/admin/feature-flags')
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ description: 'no name here' });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/admin/feature-flags/:id', () => {
    it('updates is_enabled on an existing flag', async () => {
      expect(createdFlagId).toBeDefined();

      const res = await req.put(`/api/admin/feature-flags/${createdFlagId}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ is_enabled: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.flag.is_enabled).toBe(true);

      // Verify in DB
      const row = await db.query('SELECT is_enabled FROM feature_flags WHERE id = $1', [createdFlagId]);
      expect(row.rows[0].is_enabled).toBe(true);
    });

    it('returns 404 for non-existent flag', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await req.put(`/api/admin/feature-flags/${fakeId}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ is_enabled: true });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/feature-flags/:id', () => {
    it('deletes an existing flag', async () => {
      expect(createdFlagId).toBeDefined();

      const res = await req.delete(`/api/admin/feature-flags/${createdFlagId}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deleted from DB
      const row = await db.query('SELECT id FROM feature_flags WHERE id = $1', [createdFlagId]);
      expect(row.rows).toHaveLength(0);
    });

    it('returns 404 for already-deleted flag', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await req.delete(`/api/admin/feature-flags/${fakeId}`)
        .set('Authorization', `Bearer ${adminJwt}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(404);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. HEALTH ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Health Alerts', () => {
  describe('GET /api/admin/health-alerts', () => {
    it('returns alerts array with pagination', async () => {
      const res = await req.get('/api/admin/health-alerts')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.alerts)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/health-alerts');
      expect(res.status).toBe(401);
    });

    it('supports status filter', async () => {
      const res = await req.get('/api/admin/health-alerts?status=active')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      // All returned alerts should have status=active (or the list may be empty)
      res.body.alerts.forEach((alert: any) => {
        expect(alert.status).toBe('active');
      });
    });
  });

  describe('GET /api/admin/health-alerts/overview', () => {
    it('returns summary object with expected keys', async () => {
      const res = await req.get('/api/admin/health-alerts/overview')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.bySeverity).toBeDefined();
      expect(res.body.byType).toBeDefined();
      expect(res.body.recentAlerts).toBeDefined();
      expect(res.body.topCircles).toBeDefined();

      // summary should have total_alerts count
      expect(typeof res.body.summary.total_alerts).toBe('string'); // postgres COUNT returns string
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/health-alerts/overview');
      expect(res.status).toBe(401);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Audit Logs', () => {
  describe('GET /api/admin/audit-logs', () => {
    it('returns logs array with pagination', async () => {
      const res = await req.get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(typeof res.body.pagination.page).toBe('number');
      expect(typeof res.body.pagination.limit).toBe('number');
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    it('respects limit parameter', async () => {
      const res = await req.get('/api/admin/audit-logs?limit=5&page=1')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeLessThanOrEqual(5);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/admin/admin-audit-logs', () => {
    it('returns admin audit logs with pagination', async () => {
      const res = await req.get('/api/admin/admin-audit-logs')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('contains a login entry for the test admin', async () => {
      const res = await req.get('/api/admin/admin-audit-logs?action=login')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      // There should be at least one 'login' entry for our test admin from beforeAll
      const loginLog = res.body.logs.find((l: any) => l.admin_email === adminEmail && l.action === 'login');
      expect(loginLog).toBeDefined();
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/admin-audit-logs');
      expect(res.status).toBe(401);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CIRCLES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Circles', () => {
  describe('GET /api/admin/circles', () => {
    it('returns paginated circles list', async () => {
      const res = await req.get('/api/admin/circles')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.circles)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('requires authentication', async () => {
      const res = await req.get('/api/admin/circles');
      expect(res.status).toBe(401);
    });

    it('respects limit parameter', async () => {
      const res = await req.get('/api/admin/circles?limit=1&page=1')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.circles.length).toBeLessThanOrEqual(1);
    });

    it('returns at most 500 rows for limit=999999', async () => {
      const res = await req.get('/api/admin/circles?limit=999999')
        .set('Authorization', `Bearer ${adminJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
      expect(res.body.circles.length).toBeLessThanOrEqual(500);
    });
  });
});

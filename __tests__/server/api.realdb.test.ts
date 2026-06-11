/**
 * @jest-environment node
 *
 * Real PostgreSQL integration tests for the Karuna server API.
 * Connects to a real karuna_test database — no mocks for DB or rate limiters.
 *
 * Prerequisites:
 *   1. PostgreSQL running on localhost:5437
 *   2. karuna_test database created and migrated:
 *        psql -U karuna -d karuna_test -f server/db/init.sql
 *        psql -U karuna -d karuna_test -f server/db/admin_tables.sql
 *
 * Coverage:
 *   ✔ Register → email token hashed in DB → verify-email via raw token
 *   ✔ Login → cookie set → /me → logout
 *   ✔ Forgot-password → hashed token in password_reset_tokens → reset
 *   ✔ Care circle CRUD (create, get, list members)
 *   ✔ Invitation: create (token_hash in DB) → GET by raw token → accept (new user)
 *   ✔ Pagination cap: limit=999999 returns ≤500 rows (no crash)
 *   ✔ Login rate limit: 6th attempt per IP returns 429
 *   ✔ Admin login + user list
 */

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

import supertest from 'supertest';
import crypto from 'crypto';

// ── Runtime references ────────────────────────────────────────────────────────
let req: ReturnType<typeof supertest>;
let db: any;

// IDs created during tests — populated in beforeAll seeding
let ownerUserId: string;
let ownerEmail: string;
let ownerToken: string;   // JWT for authenticated requests
let circleId: string;

// Shared admin token — created once in global beforeAll, reused across all admin suites
let sharedSuperAdminJwt: string;
let sharedSuperAdminEmail: string;

// Helpers
function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function extractCookies(res: any): string {
  const cookies: string[] = res.headers['set-cookie'] || [];
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
}

// ── App setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Must be set BEFORE any server module is required (module-level const reads).
  // In CI the individual DB_* env vars are injected; locally developers connect
  // to their own Postgres on 5437 with karuna:ganesh. Prefer a pre-built
  // DATABASE_URL if already set (e.g. from CI secrets or local .env).
  if (!process.env.DATABASE_URL) {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '5437';
    const user = process.env.DB_USER || 'karuna';
    const pass = process.env.DB_PASSWORD || 'ganesh';
    const name = process.env.DB_NAME || 'karuna_test';
    process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${name}`;
  }
  process.env.JWT_SECRET = 'realdb-test-jwt-secret-at-least-32ch!!';
  process.env.ADMIN_JWT_SECRET = 'realdb-test-admin-jwt-secret-32ch!!';
  process.env.NODE_ENV = 'test';
  process.env.VAULT_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes as hex

  db = require('../../server/db');

  const express      = require('../../server/node_modules/express');
  const cors         = require('../../server/node_modules/cors');
  const helmet       = require('../../server/node_modules/helmet');
  const { router: careRouter  } = require('../../server/careCircle');
  const { router: adminRouter } = require('../../server/admin');

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/care',  careRouter);
  app.use('/api/admin', adminRouter);

  req = supertest(app);

  // Wait a moment for the module-level async table-creation in careCircle.js
  await new Promise((r) => setTimeout(r, 500));

  // Ensure password_reset_tokens table exists (careCircle.js creates it dynamically)
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Clean test data from any prior run ──────────────────────────────────────
  await db.query("DELETE FROM admin_audit_logs WHERE true");
  await db.query("DELETE FROM admin_users WHERE email LIKE '%@realtest.karuna'");
  await db.query("DELETE FROM password_reset_tokens WHERE true");
  await db.query("DELETE FROM invitations WHERE true");
  // audit_logs / caregiver_alerts / escrow reference care_circles without ON DELETE
  // CASCADE (the recovery endpoints write them), so clear them before the circles.
  await db.query("DELETE FROM audit_logs WHERE true").catch(() => {});
  await db.query("DELETE FROM caregiver_alerts WHERE true").catch(() => {});
  await db.query("DELETE FROM vault_recovery_escrow WHERE true").catch(() => {});
  await db.query("DELETE FROM circle_members WHERE true");
  await db.query("DELETE FROM care_circles WHERE name LIKE 'RealTest%'");
  await db.query("DELETE FROM users WHERE email LIKE '%@realtest.karuna'");

  // ── Create one shared super-admin (avoids rate-limit accumulation across describes) ──
  const bcryptForSetup = require('../../server/node_modules/bcryptjs');
  sharedSuperAdminEmail = `shared-admin-${Date.now()}@realtest.karuna`;
  const adminHash = bcryptForSetup.hashSync('SharedAdmin999!', 1);
  await db.query(
    `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, 'Shared Admin', 'super_admin')`,
    [sharedSuperAdminEmail, adminHash]
  );
  const adminLoginRes = await req.post('/api/admin/auth/login')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ email: sharedSuperAdminEmail, password: 'SharedAdmin999!' });
  if (adminLoginRes.status !== 200) throw new Error(`Shared admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
  sharedSuperAdminJwt = adminLoginRes.body.token;
}, 30_000);

afterAll(async () => {
  await db.query("DELETE FROM admin_audit_logs WHERE true");
  await db.query("DELETE FROM admin_users WHERE email LIKE '%@realtest.karuna'");
  await db.query("DELETE FROM password_reset_tokens WHERE true");
  await db.query("DELETE FROM invitations WHERE true");
  // audit_logs / caregiver_alerts / escrow reference care_circles without ON DELETE
  // CASCADE (the recovery endpoints write them), so clear them before the circles.
  await db.query("DELETE FROM audit_logs WHERE true").catch(() => {});
  await db.query("DELETE FROM caregiver_alerts WHERE true").catch(() => {});
  await db.query("DELETE FROM vault_recovery_escrow WHERE true").catch(() => {});
  await db.query("DELETE FROM circle_members WHERE true");
  await db.query("DELETE FROM care_circles WHERE name LIKE 'RealTest%'");
  await db.query("DELETE FROM users WHERE email LIKE '%@realtest.karuna'");
  await db.close();
}, 15_000);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION — token stored as SHA-256 hash in DB
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/register (real DB)', () => {
  it('creates a user and stores hashed verification token in DB', async () => {
    ownerEmail = `owner-${Date.now()}@realtest.karuna`;

    const res = await req.post('/api/care/auth/register').send({
      email: ownerEmail,
      password: 'TestPass123!',
      name: 'Real Test Owner',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailVerified).toBe(false);
    expect(res.headers['set-cookie']).toBeDefined();

    // Save the JWT for authenticated requests
    ownerToken = res.body.token;
    ownerUserId = res.body.user.id;

    // Verify DB row: raw token must NOT be stored; hash MUST be stored
    const row = await db.query(
      'SELECT is_verified, email_verification_token_hash FROM users WHERE email = $1',
      [ownerEmail]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].is_verified).toBe(false);
    // hash column must be a 64-char hex string (SHA-256)
    expect(row.rows[0].email_verification_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects duplicate email', async () => {
    const res = await req.post('/api/care/auth/register').send({
      email: ownerEmail,
      password: 'TestPass123!',
      name: 'Duplicate',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('rejects passwords shorter than 8 chars', async () => {
    const res = await req.post('/api/care/auth/register').send({
      email: `short-${Date.now()}@realtest.karuna`,
      password: 'abc',
      name: 'Short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EMAIL VERIFICATION — raw token → hash lookup
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/verify-email/:token (real DB)', () => {
  it('verifies email when given the raw token from DB hash', async () => {
    // Fetch the stored hash, then reverse-engineer: the server hashes the raw token.
    // In test (NODE_ENV != production) we can grab the raw token from the verify URL.
    // Instead: we directly set a known raw token and verify with it.
    const rawToken = 'realtest-verify-token-' + Date.now();
    await db.query(
      `UPDATE users
       SET email_verification_token_hash = $1,
           email_verification_expires_at = NOW() + INTERVAL '24 hours'
       WHERE email = $2`,
      [sha256(rawToken), ownerEmail]
    );

    const res = await req.post(`/api/care/auth/verify-email/${rawToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // DB row must now be verified and token cleared
    const row = await db.query('SELECT is_verified, email_verification_token_hash FROM users WHERE email = $1', [ownerEmail]);
    expect(row.rows[0].is_verified).toBe(true);
    expect(row.rows[0].email_verification_token_hash).toBeNull();
  });

  it('returns 400 for invalid token', async () => {
    const res = await req.post('/api/care/auth/verify-email/completely-wrong-token');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 400 for expired token', async () => {
    const expiredRaw = 'expired-token-' + Date.now();
    await db.query(
      `UPDATE users
       SET email_verification_token_hash = $1,
           is_verified = false,
           email_verification_expires_at = NOW() - INTERVAL '1 hour'
       WHERE email = $2`,
      [sha256(expiredRaw), ownerEmail]
    );

    const res = await req.post(`/api/care/auth/verify-email/${expiredRaw}`);
    expect(res.status).toBe(400);

    // Restore verified state
    await db.query('UPDATE users SET is_verified = true, email_verification_token_hash = NULL WHERE email = $1', [ownerEmail]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LOGIN → /me → LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/login (real DB)', () => {
  it('logs in successfully and returns cookie + JWT + circles', async () => {
    const res = await req.post('/api/care/auth/login').send({
      email: ownerEmail,
      password: 'TestPass123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailVerified).toBe(true);
    expect(Array.isArray(res.body.circles)).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();

    ownerToken = res.body.token; // Refresh token after login

    // login_count and last_login_at updated in DB
    const row = await db.query('SELECT login_count, last_login_at FROM users WHERE email = $1', [ownerEmail]);
    expect(row.rows[0].login_count).toBeGreaterThanOrEqual(1);
    expect(row.rows[0].last_login_at).not.toBeNull();
  });

  it('returns 401 for wrong password', async () => {
    const res = await req.post('/api/care/auth/login').send({
      email: ownerEmail,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent user', async () => {
    const res = await req.post('/api/care/auth/login').send({
      email: 'nobody@realtest.karuna',
      password: 'TestPass123!',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/care/auth/me (real DB)', () => {
  it('returns user profile when authenticated via Bearer', async () => {
    const res = await req.get('/api/care/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ownerEmail);
    expect(res.body.emailVerified).toBe(true);
  });

  it('returns 401 with no token', async () => {
    const res = await req.get('/api/care/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/care/auth/logout (real DB)', () => {
  it('clears the auth cookie', async () => {
    const res = await req.post('/api/care/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Set-Cookie header should clear karuna_auth
    const cookies: string[] = res.headers['set-cookie'] || [];
    const authCookie = cookies.find((c: string) => c.includes('karuna_auth'));
    expect(authCookie).toBeDefined();
    expect(authCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PASSWORD RESET — token hashed in password_reset_tokens table
// ═══════════════════════════════════════════════════════════════════════════════
describe('Password reset flow (real DB)', () => {
  let rawResetToken: string;

  it('POST /auth/forgot-password stores a hashed token in DB', async () => {
    const res = await req.post('/api/care/auth/forgot-password').send({ email: ownerEmail });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // In non-production NODE_ENV, the raw token is returned
    expect(res.body.resetToken).toBeDefined();
    rawResetToken = res.body.resetToken;

    // DB must have the hash, not the raw token
    const row = await db.query(
      'SELECT token, expires_at FROM password_reset_tokens WHERE user_id = $1',
      [ownerUserId]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].token).toBe(sha256(rawResetToken));
    expect(row.rows[0].token).toHaveLength(64); // SHA-256 hex
    expect(new Date(row.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('POST /auth/reset-password resets with the raw token and cleans up', async () => {
    const newPassword = 'NewSecurePass456!';
    const res = await req.post('/api/care/auth/reset-password').send({
      token: rawResetToken,
      password: newPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Token row must be deleted
    const tokenRow = await db.query(
      'SELECT id FROM password_reset_tokens WHERE user_id = $1',
      [ownerUserId]
    );
    expect(tokenRow.rows).toHaveLength(0);

    // Can login with new password
    const loginRes = await req.post('/api/care/auth/login').send({
      email: ownerEmail,
      password: newPassword,
    });
    expect(loginRes.status).toBe(200);
    ownerToken = loginRes.body.token;
  });

  it('POST /auth/reset-password returns 400 for expired/wrong token', async () => {
    const res = await req.post('/api/care/auth/reset-password').send({
      token: 'completely-wrong-token',
      password: 'AnotherPassword789!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CARE CIRCLES — CRUD with real DB
// ═══════════════════════════════════════════════════════════════════════════════
describe('Care circle CRUD (real DB)', () => {
  it('POST /api/care/circles creates a circle and makes owner a member', async () => {
    const res = await req.post('/api/care/circles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'RealTest Circle',
        elderlyName: 'Grandma Test',
      });

    expect(res.status).toBe(200);
    expect(res.body.circle.name).toBe('RealTest Circle');
    circleId = res.body.circle.id;

    // Check circle_members table
    const mem = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, ownerUserId]
    );
    expect(mem.rows).toHaveLength(1);
    expect(mem.rows[0].role).toBe('owner');
  });

  it('GET /api/care/circles lists circles for authenticated user', async () => {
    const res = await req.get('/api/care/circles')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    // Route returns result.rows directly (an array)
    const circles = Array.isArray(res.body) ? res.body : (res.body.circles || []);
    expect(Array.isArray(circles)).toBe(true);
    expect(circles.some((c: any) => c.id === circleId)).toBe(true);
  });

  it('GET /api/care/circles/:circleId returns the circle with members array', async () => {
    const res = await req.get(`/api/care/circles/${circleId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    // Query aliases user_id as "userId" (camelCase)
    const owner = res.body.members.find((m: any) => m.userId === ownerUserId);
    expect(owner).toBeDefined();
    expect(owner.role).toBe('owner');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. INVITATIONS — token_hash stored in DB, raw token in URL
// ═══════════════════════════════════════════════════════════════════════════════
describe('Invitation flow (real DB)', () => {
  const inviteeEmail = `invitee-${Date.now()}@realtest.karuna`;
  let inviteLink: string;
  let rawInviteToken: string;

  it('POST /circles/:id/invite creates invitation with hashed token in DB', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: inviteeEmail, role: 'caregiver' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    inviteLink = res.body.invitation.inviteLink; // e.g. /invite/<rawToken>
    rawInviteToken = inviteLink.split('/').pop()!;

    // DB must store the hash, not the raw token
    const row = await db.query(
      'SELECT token_hash FROM invitations WHERE email = $1 AND circle_id = $2',
      [inviteeEmail, circleId]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].token_hash).toBe(sha256(rawInviteToken));
    expect(row.rows[0].token_hash).toHaveLength(64);
    // Raw token must NOT appear anywhere in the DB row
    expect(row.rows[0].token_hash).not.toBe(rawInviteToken);
  });

  it('GET /invitations/:token returns invite info by raw token', async () => {
    const res = await req.get(`/api/care/invitations/${rawInviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(inviteeEmail);
    expect(res.body.circleName).toBe('RealTest Circle');
    expect(res.body.userExists).toBe(false); // new user
  });

  it('GET /invitations/:token returns 404 for wrong raw token', async () => {
    const res = await req.get('/api/care/invitations/completely-wrong-raw-token');
    expect(res.status).toBe(404);
  });

  it('POST /invitations/:token/accept creates new user with is_verified=true', async () => {
    const res = await req.post(`/api/care/invitations/${rawInviteToken}/accept`).send({
      password: 'InviteePass789!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(inviteeEmail);

    // New user must be is_verified = true (invitation flow bypasses email verify)
    const userRow = await db.query('SELECT is_verified FROM users WHERE email = $1', [inviteeEmail]);
    expect(userRow.rows[0].is_verified).toBe(true);

    // Invitation must be marked accepted
    const invRow = await db.query(
      "SELECT status FROM invitations WHERE email = $1 AND circle_id = $2",
      [inviteeEmail, circleId]
    );
    expect(invRow.rows[0].status).toBe('accepted');

    // Invitee must be in circle_members
    const memRow = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, res.body.user.id]
    );
    expect(memRow.rows[0].role).toBe('caregiver');
  });

  it('POST /invitations/:token/accept returns 404 for already-accepted token', async () => {
    const res = await req.post(`/api/care/invitations/${rawInviteToken}/accept`).send({
      password: 'SomePass123!',
    });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. LOGIN RATE LIMIT — 5 per minute; 6th returns 429
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PAGINATION CAP — limit=999999 must not crash or return unbounded rows
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin pagination cap (real DB)', () => {
  it('GET /api/admin/users?limit=999999 returns at most 500 rows', async () => {
    const res = await req.get('/api/admin/users?limit=999999')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
    expect((res.body.users || []).length).toBeLessThanOrEqual(500);
  });

  it('GET /api/admin/circles?limit=999999 returns at most 500 rows', async () => {
    const res = await req.get('/api/admin/circles?limit=999999')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    const circles = res.body.circles || res.body.data || [];
    expect(circles.length).toBeLessThanOrEqual(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ADMIN AUTH — login, logout, permission enforcement
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin auth flows (real DB)', () => {
  it('GET /api/admin/users requires valid admin JWT', async () => {
    const noAuth = await req.get('/api/admin/users');
    expect(noAuth.status).toBe(401);

    const withAuth = await req.get('/api/admin/users')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);
    expect(withAuth.status).toBe(200);
  });

  it('admin audit log is created on login', async () => {
    const row = await db.query(
      "SELECT action FROM admin_audit_logs WHERE admin_email = $1 AND action = 'login' ORDER BY created_at DESC LIMIT 1",
      [sharedSuperAdminEmail]
    );
    expect(row.rows.length).toBeGreaterThanOrEqual(1);
    expect(row.rows[0].action).toBe('login');
  });

  it('POST /api/admin/auth/login returns 401 for wrong password', async () => {
    const res = await req.post('/api/admin/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: sharedSuperAdminEmail, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FEATURE FLAGS — real DB query
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/flags/evaluate (real DB)', () => {
  it('returns evaluated feature flags seeded by migration', async () => {
    const res = await req.post('/api/care/flags/evaluate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ circleId: circleId || null });

    expect(res.status).toBe(200);
    const flags = res.body.flags || res.body;
    // 'proactive_checkins' seeded by admin_tables.sql with enabled_for_all=true
    expect(typeof flags).toBe('object');
    if (!Array.isArray(flags)) {
      // evaluate endpoint returns { flagName: true/false } map
      expect(flags).toHaveProperty('proactive_checkins', true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. VAULT MEDICATIONS — CRUD with real DB
// ═══════════════════════════════════════════════════════════════════════════════
describe('Vault medications CRUD (real DB)', () => {
  let medicationId: string;

  it('POST /circles/:id/vault/medications creates a medication', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/vault/medications`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Aspirin',
        dosage: '100mg',
        frequency: 'daily',
        timing: ['morning'],
        instructions: 'Take with food',
        prescribingDoctor: 'Dr. Smith',
        isActive: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.medication.name).toBe('Aspirin');
    medicationId = res.body.medication.id;

    // Verify it's actually in the DB
    const row = await db.query('SELECT name, dosage FROM vault_medications WHERE id = $1', [medicationId]);
    expect(row.rows[0].name).toBe('Aspirin');
    expect(row.rows[0].dosage).toBe('100mg');
  });

  it('GET /circles/:id/vault/medications lists with pagination metadata', async () => {
    const res = await req.get(`/api/care/circles/${circleId}/vault/medications`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((m: any) => m.id === medicationId)).toBe(true);
  });

  it('GET /circles/:id/vault/medications respects limit parameter', async () => {
    const res = await req.get(`/api/care/circles/${circleId}/vault/medications?limit=1&offset=0`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it('PUT /circles/:id/vault/medications/:id updates the medication', async () => {
    const res = await req.put(`/api/care/circles/${circleId}/vault/medications/${medicationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dosage: '200mg', instructions: 'Take with water' });

    expect(res.status).toBe(200);
    expect(res.body.medication.dosage).toBe('200mg');
    expect(res.body.medication.instructions).toBe('Take with water');

    // Verify in DB
    const row = await db.query('SELECT dosage FROM vault_medications WHERE id = $1', [medicationId]);
    expect(row.rows[0].dosage).toBe('200mg');
  });

  it('DELETE /circles/:id/vault/medications/:id removes the medication', async () => {
    const res = await req.delete(`/api/care/circles/${circleId}/vault/medications/${medicationId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm gone from DB
    const row = await db.query('SELECT id FROM vault_medications WHERE id = $1', [medicationId]);
    expect(row.rows).toHaveLength(0);
  });

  it('DELETE /circles/:id/vault/medications/:id returns 404 for non-existent id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await req.delete(`/api/care/circles/${circleId}/vault/medications/${fakeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('caregiver role can create medications but viewer cannot', async () => {
    // Create a viewer user and add to circle
    const viewerEmail = `viewer-${Date.now()}@realtest.karuna`;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO invitations (circle_id, invited_by, email, name, role, token_hash, expires_at)
       VALUES ($1, $2, $3, 'Viewer Test', 'viewer', $4, $5)`,
      [circleId, ownerUserId, viewerEmail, sha256(rawToken), expiresAt]
    );

    const acceptRes = await req.post(`/api/care/invitations/${rawToken}/accept`)
      .send({ password: 'ViewerPass123!' });
    expect(acceptRes.status).toBe(200);

    const viewerToken = acceptRes.body.token;

    const denyRes = await req.post(`/api/care/circles/${circleId}/vault/medications`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Blocked Med', dosage: '50mg', frequency: 'daily' });

    expect(denyRes.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. SYNC ENDPOINT — pull and push bidirectional sync
// ═══════════════════════════════════════════════════════════════════════════════
describe('Sync endpoint (real DB)', () => {
  let syncMedId: string;

  beforeAll(async () => {
    // Seed one medication directly so we can verify pull
    const res = await db.query(
      `INSERT INTO vault_medications (circle_id, name, dosage, frequency, timing, is_active, created_by)
       VALUES ($1, 'Sync Test Med', '50mg', 'twice daily', '{}', true, 'Test')
       RETURNING id`,
      [circleId]
    );
    syncMedId = res.rows[0].id;
  });

  it('GET /circles/:id/sync returns all vault data for the circle', async () => {
    const res = await req.get(`/api/care/circles/${circleId}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.medications)).toBe(true);
    expect(res.body.medications.some((m: any) => m.id === syncMedId)).toBe(true);
    expect(Array.isArray(res.body.doctors)).toBe(true);
    expect(Array.isArray(res.body.contacts)).toBe(true);
  });

  it('GET /circles/:id/sync supports ?limit pagination', async () => {
    const res = await req.get(`/api/care/circles/${circleId}/sync?limit=1&offset=0`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.medications.length).toBeLessThanOrEqual(1);
  });

  it('POST /circles/:id/sync applies create changes via bidirectional sync', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        changes: [
          {
            entityType: 'medication',
            entityId: null,
            action: 'create',
            data: { name: 'Synced Med', dosage: '75mg', frequency: 'daily', is_active: true },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(1);
    expect(res.body.conflicts).toHaveLength(0);

    // Verify in DB
    const newId = res.body.applied[0].serverId;
    const row = await db.query('SELECT name FROM vault_medications WHERE id = $1', [newId]);
    expect(row.rows[0].name).toBe('Synced Med');
  });

  it('POST /circles/:id/sync applies update and delete changes', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        changes: [
          {
            entityType: 'medication',
            entityId: syncMedId,
            action: 'update',
            data: { dosage: '100mg' },
          },
          {
            entityType: 'doctor',
            entityId: '00000000-0000-0000-0000-000000000000',
            action: 'delete',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(1); // update applied
    expect(res.body.conflicts).toHaveLength(1); // delete of non-existent doctor

    // Verify update took effect
    const row = await db.query('SELECT dosage FROM vault_medications WHERE id = $1', [syncMedId]);
    expect(row.rows[0].dosage).toBe('100mg');
  });

  it('POST /circles/:id/sync rejects unknown entity types', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        changes: [
          { entityType: 'admin_users', entityId: null, action: 'create', data: { email: 'hack@example.com' } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(0);
    expect(res.body.conflicts[0].reason).toBe('invalid_entity_type');
  });

  it('POST /circles/:id/sync rejects non-whitelisted column names', async () => {
    const res = await req.post(`/api/care/circles/${circleId}/sync`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        changes: [
          {
            entityType: 'medication',
            entityId: null,
            action: 'create',
            data: { name: 'Valid', circle_id: 'injected', DROP_TABLE: '1' },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(0);
    expect(res.body.conflicts[0].reason).toBe('invalid_fields');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. ADMIN USER MANAGEMENT — suspend, unsuspend, audit trail
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin user management (real DB)', () => {
  it('GET /api/admin/users returns paginated list with total count', async () => {
    const res = await req.get('/api/admin/users')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(typeof res.body.pagination.total).toBe('number');
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/users/:id returns user detail', async () => {
    const res = await req.get(`/api/admin/users/${ownerUserId}`)
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ownerUserId);
    expect(res.body.user.email).toBe(ownerEmail);
  });

  it('POST /api/admin/users/:id/suspend sets is_active=false and creates audit log', async () => {
    const res = await req.post(`/api/admin/users/${ownerUserId}/suspend`)
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Test suspension for integration test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify DB: is_active=false AND suspended_at set
    const row = await db.query(
      'SELECT is_active, suspended_at, suspended_reason FROM users WHERE id = $1',
      [ownerUserId]
    );
    expect(row.rows[0].is_active).toBe(false);
    expect(row.rows[0].suspended_at).not.toBeNull();
    expect(row.rows[0].suspended_reason).toBe('Test suspension for integration test');

    // Verify audit log created
    const auditRow = await db.query(
      "SELECT action FROM admin_audit_logs WHERE resource_id = $1 AND action = 'suspend_user' ORDER BY created_at DESC LIMIT 1",
      [ownerUserId]
    );
    expect(auditRow.rows).toHaveLength(1);
  });

  it('suspended user login returns 401 (is_active=false blocks login)', async () => {
    // Use a fresh user so we don't hit the care login rate limiter
    const suspendedEmail = `suspend-check-${Date.now()}@realtest.karuna`;
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const hash = bcrypt.hashSync('TempPass123!', 1);
    const userRow = await db.query(
      `INSERT INTO users (email, password_hash, name, is_verified, is_active)
       VALUES ($1, $2, 'Suspend Check', true, false) RETURNING id`,
      [suspendedEmail, hash]
    );
    const suspendedUserId = userRow.rows[0].id;

    const res = await req.post('/api/care/auth/login').send({
      email: suspendedEmail,
      password: 'TempPass123!',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/suspended/i);

    // Clean up
    await db.query('DELETE FROM users WHERE id = $1', [suspendedUserId]);
  });

  it('POST /api/admin/users/:id/unsuspend re-activates user', async () => {
    const res = await req.post(`/api/admin/users/${ownerUserId}/unsuspend`)
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify DB
    const row = await db.query(
      'SELECT is_active, suspended_at FROM users WHERE id = $1',
      [ownerUserId]
    );
    expect(row.rows[0].is_active).toBe(true);
    expect(row.rows[0].suspended_at).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. ADMIN AUDIT LOG — unknown-email login failure no longer crashes
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin audit log — pre-auth events (real DB)', () => {
  it('login failure for unknown email returns 401 and inserts null-admin_id audit row', async () => {
    const before = await db.query(
      "SELECT COUNT(*) FROM admin_audit_logs WHERE action = 'login_failed' AND admin_email = 'unknown@realtest.karuna'"
    );
    const countBefore = parseInt(before.rows[0].count);

    const res = await req.post('/api/admin/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'unknown@realtest.karuna', password: 'wrongpass' });

    expect(res.status).toBe(401);

    const afterCount = await db.query(
      "SELECT COUNT(*) FROM admin_audit_logs WHERE action = 'login_failed' AND admin_email = $1",
      ['unknown@realtest.karuna']
    );
    const countAfter = parseInt(afterCount.rows[0].count);

    // Row was inserted (admin_id is now nullable — no longer silently dropped)
    expect(countAfter).toBeGreaterThan(countBefore);

    const lastRow = await db.query(
      "SELECT admin_id FROM admin_audit_logs WHERE action = 'login_failed' AND admin_email = $1 ORDER BY created_at DESC LIMIT 1",
      ['unknown@realtest.karuna']
    );
    expect(lastRow.rows[0].admin_id).toBeNull(); // no admin associated
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. ADMIN CIRCLES — list and deactivate
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin circle management (real DB)', () => {
  it('GET /api/admin/circles returns all circles with member count', async () => {
    const res = await req.get('/api/admin/circles')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    const circles = res.body.circles || res.body.data || res.body;
    expect(Array.isArray(circles)).toBe(true);
    const ours = circles.find((c: any) => c.id === circleId);
    expect(ours).toBeDefined();
  });

  it('GET /api/admin/circles?limit=1 respects pagination cap', async () => {
    const res = await req.get('/api/admin/circles?limit=1&offset=0')
      .set('Authorization', `Bearer ${sharedSuperAdminJwt}`);

    expect(res.status).toBe(200);
    const circles = res.body.circles || res.body.data || [];
    expect(circles.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. LOGIN RATE LIMITER — moved last so it doesn't affect other login tests
// ═══════════════════════════════════════════════════════════════════════════════
describe('Login rate limiter (real DB, real rate-limit) — LAST', () => {
  it('returns 429 after excessive login attempts within 1 minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await req.post('/api/care/auth/login').send({
        email: `ratelimit-${i}-${Date.now()}@realtest.karuna`,
        password: 'wrongpass',
      });
      statuses.push(res.status);
    }
    // Rate limiter (5/min) must have triggered at least once
    expect(statuses.some((s) => s === 429)).toBe(true);
  }, 20_000);
});

// ── Vault PIN recovery escrow (H3) ──────────────────────────────────────────────
describe('Vault PIN recovery escrow (real DB)', () => {
  let recOwnerToken: string;
  let recCircleId: string;
  let cgToken: string;
  let cgUserId: string;
  const stamp = Date.now();
  const ownerEmail = `rec-owner-${stamp}@realtest.karuna`;
  const cgEmail = `rec-cg-${stamp}@realtest.karuna`;

  beforeAll(async () => {
    // The recovery table ships via migration 006; ensure it exists for the test DB.
    await db.query(`
      CREATE TABLE IF NOT EXISTS vault_recovery_escrow (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        circle_id UUID NOT NULL REFERENCES care_circles(id) ON DELETE CASCADE,
        wrapped_dek TEXT NOT NULL,
        recovery_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        requested_at TIMESTAMP WITH TIME ZONE,
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, circle_id)
      )`);

    // Seed owner + caregiver + circle directly (HTTP register/login would hit the
    // registration rate limiter this late in the suite). Mint matching JWTs.
    const jwtLib = require('../../server/node_modules/jsonwebtoken');
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const hash = bcrypt.hashSync('SeedPass123!', 1);
    const mkUser = async (email: string, name: string) => {
      const r = await db.query(
        'INSERT INTO users (email, password_hash, name, is_verified) VALUES ($1, $2, $3, true) RETURNING id',
        [email, hash, name]
      );
      return r.rows[0].id as string;
    };
    const ownerId = await mkUser(ownerEmail, 'Rec Owner');
    cgUserId = await mkUser(cgEmail, 'Rec Caregiver');

    const cr = await db.query(
      'INSERT INTO care_circles (name, care_recipient_name) VALUES ($1, $2) RETURNING id',
      ['RealTest Recovery Circle', 'Rec Owner']
    );
    recCircleId = cr.rows[0].id;
    await db.query(
      `INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'caregiver')`,
      [recCircleId, ownerId, cgUserId]
    );

    const mkTok = (id: string, email: string, name: string) =>
      jwtLib.sign({ id, email, name }, process.env.JWT_SECRET, { expiresIn: '1h' });
    recOwnerToken = mkTok(ownerId, ownerEmail, 'Rec Owner');
    cgToken = mkTok(cgUserId, cgEmail, 'Rec Caregiver');
  });

  function set2(r: any, t: string) { return r.set('Authorization', `Bearer ${t}`); }

  it('full flow: escrow → request → owner approves → one-shot material release', async () => {
    // Escrow (caregiver stores their wrapped DEK + recovery key)
    const esc = await set2(req.post(`/api/care/circles/${recCircleId}/recovery/escrow`), cgToken)
      .send({ wrappedDek: 'WRAPPED-DEK', recoveryKey: 'RK-super-secret' });
    expect(esc.status).toBe(200);

    // Material before approval → 403
    const m0 = await set2(req.get(`/api/care/circles/${recCircleId}/recovery/material`), cgToken);
    expect(m0.status).toBe(403);

    // Request recovery
    const rq = await set2(req.post(`/api/care/circles/${recCircleId}/recovery/request`), cgToken).send({});
    expect(rq.status).toBe(200);
    expect(rq.body.status).toBe('pending');

    // Requester cannot approve their own request
    const self = await set2(req.post(`/api/care/circles/${recCircleId}/recovery/${cgUserId}/approve`), cgToken).send({});
    expect(self.status).toBe(403);

    // Owner sees the pending request and approves
    const list = await set2(req.get(`/api/care/circles/${recCircleId}/recovery/requests`), recOwnerToken);
    expect(list.status).toBe(200);
    expect(list.body.requests.some((r: any) => r.userId === cgUserId)).toBe(true);

    const ap = await set2(req.post(`/api/care/circles/${recCircleId}/recovery/${cgUserId}/approve`), recOwnerToken).send({});
    expect(ap.status).toBe(200);

    // Material released and round-trips the escrowed values
    const m1 = await set2(req.get(`/api/care/circles/${recCircleId}/recovery/material`), cgToken);
    expect(m1.status).toBe(200);
    expect(m1.body).toEqual({ wrappedDek: 'WRAPPED-DEK', recoveryKey: 'RK-super-secret' });

    // One-shot: a second fetch is denied (status reset to 'active')
    const m2 = await set2(req.get(`/api/care/circles/${recCircleId}/recovery/material`), cgToken);
    expect(m2.status).toBe(403);
  });

  it('stores the recovery key encrypted at rest (not plaintext)', async () => {
    const row = await db.query(
      'SELECT recovery_key FROM vault_recovery_escrow WHERE user_id = $1 AND circle_id = $2',
      [cgUserId, recCircleId]
    );
    expect(row.rows[0].recovery_key).not.toContain('RK-super-secret');
    expect(String(row.rows[0].recovery_key).split('.').length).toBe(3); // iv.tag.ciphertext
  });

  it('a non-member cannot request recovery', async () => {
    const jwtLib = require('../../server/node_modules/jsonwebtoken');
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const strangerEmail = `rec-stranger-${stamp}@realtest.karuna`;
    const sr = await db.query(
      'INSERT INTO users (email, password_hash, name, is_verified) VALUES ($1, $2, $3, true) RETURNING id',
      [strangerEmail, bcrypt.hashSync('SeedPass123!', 1), 'Stranger']
    );
    const strangerToken = jwtLib.sign(
      { id: sr.rows[0].id, email: strangerEmail, name: 'Stranger' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const r = await set2(req.post(`/api/care/circles/${recCircleId}/recovery/request`), strangerToken).send({});
    expect(r.status).toBe(403);
  });
});

describe('GDPR export & account deletion (real DB)', () => {
  const stamp = Date.now();
  const ownerEmail = `gdpr-owner-${stamp}@realtest.karuna`;
  const cgEmail = `gdpr-cg-${stamp}@realtest.karuna`;
  const PASSWORD = 'SeedPass123!';
  let ownerId: string;
  let cgId: string;
  let circleId: string;
  let ownerToken: string;
  let cgToken: string;

  beforeAll(async () => {
    const jwtLib = require('../../server/node_modules/jsonwebtoken');
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const hash = bcrypt.hashSync(PASSWORD, 1);
    const mkUser = async (email: string, name: string) => {
      const r = await db.query(
        'INSERT INTO users (email, password_hash, name, is_verified) VALUES ($1, $2, $3, true) RETURNING id',
        [email, hash, name]
      );
      return r.rows[0].id as string;
    };
    ownerId = await mkUser(ownerEmail, 'GDPR Owner');
    cgId = await mkUser(cgEmail, 'GDPR Caregiver');
    const cr = await db.query(
      'INSERT INTO care_circles (name, care_recipient_name) VALUES ($1, $2) RETURNING id',
      ['GDPR Test Circle', 'GDPR Owner']
    );
    circleId = cr.rows[0].id;
    await db.query(
      `INSERT INTO circle_members (circle_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'caregiver')`,
      [circleId, ownerId, cgId]
    );
    await db.query(
      `INSERT INTO vault_medications (circle_id, name, dosage, frequency, timing, is_active, created_by)
       VALUES ($1, 'GDPR Test Med', '10mg', 'daily', '{08:00}', true, $2)`,
      [circleId, 'GDPR Owner']
    );
    // Note authored by the caregiver in the owner's circle — must be deleted
    // (not orphaned) when the caregiver deletes their account.
    await db.query(
      `INSERT INTO vault_notes (circle_id, author_id, author_name, author_role, title, content, category)
       VALUES ($1, $2, 'GDPR Caregiver', 'caregiver', 'GDPR note', 'authored by caregiver', 'general')`,
      [circleId, cgId]
    );
    const mkTok = (id: string, email: string, name: string) =>
      jwtLib.sign({ id, email, name }, process.env.JWT_SECRET, { expiresIn: '1h' });
    ownerToken = mkTok(ownerId, ownerEmail, 'GDPR Owner');
    cgToken = mkTok(cgId, cgEmail, 'GDPR Caregiver');
  }, 30_000);

  function auth(r: any, t: string) { return r.set('Authorization', `Bearer ${t}`); }

  it('GET /auth/export returns full data for an owner', async () => {
    const res = await auth(req.get('/api/care/auth/export'), ownerToken);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('karuna-data-export');
    expect(res.body.profile.email).toBe(ownerEmail);
    expect(res.body.memberships.some((m: any) => m.circle_id === circleId)).toBe(true);
    const owned = res.body.ownedCircles.find((c: any) => c.circle.id === circleId);
    expect(owned).toBeDefined();
    expect(owned.vault.medications.some((m: any) => m.name === 'GDPR Test Med')).toBe(true);
    expect(owned.members.length).toBe(2);
  });

  it('delete requires the correct password', async () => {
    const noPw = await auth(req.post('/api/care/auth/delete-account'), cgToken).send({});
    expect(noPw.status).toBe(400);
    const wrongPw = await auth(req.post('/api/care/auth/delete-account'), cgToken)
      .send({ password: 'not-the-password' });
    expect(wrongPw.status).toBe(403);
  });

  it('owner deletion without confirmation returns 409 listing owned circles', async () => {
    const res = await auth(req.post('/api/care/auth/delete-account'), ownerToken)
      .send({ password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.ownedCircles.some((c: any) => c.id === circleId)).toBe(true);
  });

  it('caregiver deletion removes the user and their notes but keeps the circle', async () => {
    const res = await auth(req.post('/api/care/auth/delete-account'), cgToken)
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);

    expect((await db.query('SELECT 1 FROM users WHERE id = $1', [cgId])).rows.length).toBe(0);
    expect((await db.query('SELECT 1 FROM vault_notes WHERE author_id = $1', [cgId])).rows.length).toBe(0);
    expect((await db.query('SELECT 1 FROM care_circles WHERE id = $1', [circleId])).rows.length).toBe(1);
    expect((await db.query('SELECT 1 FROM circle_members WHERE user_id = $1', [cgId])).rows.length).toBe(0);
  });

  it('owner deletion with confirmation removes the user and the owned circle', async () => {
    const res = await auth(req.post('/api/care/auth/delete-account'), ownerToken)
      .send({ password: PASSWORD, confirmDeleteOwnedCircles: true });
    expect(res.status).toBe(200);

    expect((await db.query('SELECT 1 FROM users WHERE id = $1', [ownerId])).rows.length).toBe(0);
    expect((await db.query('SELECT 1 FROM care_circles WHERE id = $1', [circleId])).rows.length).toBe(0);
    expect((await db.query('SELECT 1 FROM vault_medications WHERE circle_id = $1', [circleId])).rows.length).toBe(0);
  });
});

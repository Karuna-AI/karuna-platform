/**
 * @jest-environment node
 *
 * Integration tests for the Karuna server API.
 * Uses supertest against the real Express routes with a mocked DB —
 * no PostgreSQL connection required.
 *
 * Coverage:
 *   ✔ User auth (register, login, me, logout, verify-email)
 *   ✔ Care circles (create, list, get)
 *   ✔ Member invitations (create, tier limit enforcement)
 *   ✔ Vault CRUD (medications, documents with file encryption, tier limits)
 *   ✔ Invitation acceptance (existing user + new user → is_verified=true)
 *   ✔ Bidirectional sync (push + pull)
 *   ✔ Feature flag evaluation
 *   ✔ Admin auth (login, logout)
 *   ✔ Admin user/circle management with pagination
 *   ✔ Permission enforcement (401 / 403 paths)
 */

// ── DB module is mocked before any server code is loaded ─────────────────────
jest.mock('../../server/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  checkConnection: jest.fn().mockResolvedValue(true),
  close: jest.fn(),
  pool: { end: jest.fn(), on: jest.fn() },
}));

// ── Prevent real HTTP calls to OpenAI / OpenRouter ───────────────────────────
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: {
      choices: [{ message: { content: 'Hello from mock AI' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    },
  }),
  create: jest.fn(() => ({ post: jest.fn(), get: jest.fn() })),
}));

// ── Mock bcrypt to use minimal rounds (prevents 10-second timeout) ────────────
// Use plain arrow functions (NOT jest.fn()) so resetMocks: true in jest.config
// doesn't wipe out the implementations between tests.
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

// ── Mock rate limiters to no-op (prevents 429 from rate state bleeding) ───────
jest.mock('../../server/node_modules/express-rate-limit', () =>
  () => (_req: any, _res: any, next: any) => next()
);

import supertest from 'supertest';

// ── Shared test IDs ───────────────────────────────────────────────────────────
const U = 'user-uuid-1111';
const C = 'circle-uuid-2222';
const INV_TOKEN = 'invite-token-abc123';
const VERIFY_TOKEN = 'verify-token-xyz789';
const DOC_ID = 'doc-uuid-3333';
const MED_ID = 'med-uuid-4444';

// ── Runtime references (populated in beforeAll) ───────────────────────────────
let req: ReturnType<typeof supertest>;
let db: any;
let USER_TOKEN: string;
let ADMIN_TOKEN: string;
let KNOWN_HASH: string; // bcrypt hash of 'password123'

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockUser(overrides = {}) {
  return { id: U, email: 'test@example.com', name: 'Test User', is_verified: true, ...overrides };
}
function mockCircle(overrides = {}) {
  return { id: C, name: 'Test Circle', care_recipient_name: 'Grandma', subscription_tier: 'free', is_active: true, ...overrides };
}
function mockMember(overrides = {}) {
  return { id: 'member-1', user_id: U, circle_id: C, role: 'owner', email: 'test@example.com', name: 'Test User', ...overrides };
}

// ── App setup ─────────────────────────────────────────────────────────────────
beforeAll(() => {
  // Set JWT secrets BEFORE loading the server modules so the module-level
  // const JWT_SECRET = process.env.JWT_SECRET reads the right value.
  process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests!';
  process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret-integration!!';
  process.env.NODE_ENV = 'test';
  process.env.VAULT_ENCRYPTION_KEY = '0'.repeat(64); // 32 zero bytes as hex

  db = require('../../server/db');

  const express    = require('../../server/node_modules/express');
  const cors       = require('../../server/node_modules/cors');
  const helmet     = require('../../server/node_modules/helmet');
  const jwt        = require('../../server/node_modules/jsonwebtoken');
  const bcrypt     = require('../../server/node_modules/bcryptjs');
  const { router: careRouter  } = require('../../server/careCircle');
  const { router: adminRouter } = require('../../server/admin');

  // Pre-hash 'password123' — mock hashSync always uses 1 round for speed
  KNOWN_HASH = bcrypt.hashSync('password123', 4);

  USER_TOKEN  = jwt.sign({ id: U, email: 'test@example.com', name: 'Test User' },
    process.env.JWT_SECRET, { expiresIn: '1h' });

  ADMIN_TOKEN = jwt.sign({ id: 'admin-1', email: 'admin@example.com', role: 'super_admin' },
    process.env.ADMIN_JWT_SECRET, { expiresIn: '1h' });

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/care',  careRouter);
  app.use('/api/admin', adminRouter);

  req = supertest(app);
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default db.query fallback — prevents TypeError on unexpected extra calls
  (db.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
  // Default transaction: call the callback with a stub client
  (db.transaction as jest.Mock).mockImplementation(async (fn: Function) =>
    fn({ query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) })
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. USER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/register', () => {
  it('creates account and returns emailVerified: false with auth cookie', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // no existing user
      .mockResolvedValueOnce({ rows: [mockUser()], rowCount: 1 });   // INSERT user

    const res = await req.post('/api/care/auth/register').send({
      email: 'test@example.com', password: 'password123', name: 'Test User',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailVerified).toBe(false);
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate email with 400', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }], rowCount: 1 }); // user exists

    const res = await req.post('/api/care/auth/register').send({
      email: 'test@example.com', password: 'password123', name: 'Test',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('rejects request with missing required fields', async () => {
    const res = await req.post('/api/care/auth/register').send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const res = await req.post('/api/care/auth/register').send({
      email: 'test@example.com', password: 'short', name: 'Test',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. USER LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/login', () => {
  it('logs in successfully and returns token, emailVerified, and circles', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ ...mockUser(), password_hash: KNOWN_HASH }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // SELECT circles
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE last_login_at

    const res = await req.post('/api/care/auth/login').send({
      email: 'test@example.com', password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.emailVerified).toBe(true);
    expect(Array.isArray(res.body.circles)).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ ...mockUser(), password_hash: KNOWN_HASH }], rowCount: 1 });

    const res = await req.post('/api/care/auth/login').send({
      email: 'test@example.com', password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await req.post('/api/care/auth/login').send({
      email: 'nobody@example.com', password: 'password123',
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await req.post('/api/care/auth/login').send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GET /auth/me — requires auth
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/care/auth/me', () => {
  it('returns user profile when authenticated via Bearer token', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockUser()], rowCount: 1 })   // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });             // SELECT circles

    const res = await req.get('/api/care/auth/me')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(U);
    expect(res.body.emailVerified).toBe(true);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await req.get('/api/care/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered token', async () => {
    const res = await req.get('/api/care/auth/me')
      .set('Authorization', 'Bearer totally.fake.token');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/logout', () => {
  it('clears the auth cookie and returns success', async () => {
    const res = await req.post('/api/care/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Cookie should be cleared (max-age=0 or expires in past)
    const cookie = (res.headers['set-cookie'] || []).find((c: string) =>
      c.startsWith('karuna_auth=')
    );
    expect(cookie).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/auth/verify-email/:token', () => {
  it('marks account as verified for a valid token', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: U, email: 'test@example.com', name: 'Test', is_verified: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE

    const res = await req.post(`/api/care/auth/verify-email/${VERIFY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns success immediately for already-verified accounts', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: U, email: 'test@example.com', name: 'Test', is_verified: true }], rowCount: 1 });

    const res = await req.post(`/api/care/auth/verify-email/${VERIFY_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.alreadyVerified).toBe(true);
  });

  it('returns 400 for an invalid or expired token', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await req.post('/api/care/auth/verify-email/bad-token');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CARE CIRCLES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Care Circle endpoints', () => {
  it('POST /circles — creates a care circle (authenticated)', async () => {
    // Create circle uses db.transaction internally — override the per-test mock
    (db.transaction as jest.Mock).mockImplementationOnce(async (fn: Function) =>
      fn({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockCircle()], rowCount: 1 })  // INSERT care_circles
          .mockResolvedValueOnce({ rows: [], rowCount: 1 }),              // INSERT circle_members
      })
    );

    const res = await req.post('/api/care/circles')
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ name: 'Test Circle', elderlyName: 'Grandma' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.circle.name).toBe('Test Circle');
  });

  it('POST /circles — returns 401 without auth', async () => {
    const res = await req.post('/api/care/circles').send({ name: 'X', elderlyName: 'Y' });
    expect(res.status).toBe(401);
  });

  it('GET /circles — returns list of circles for authenticated user', async () => {
    // Handler returns result.rows directly (an array, not { circles: [...] })
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ ...mockCircle(), role: 'owner' }], rowCount: 1 });

    const res = await req.get('/api/care/circles')
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe(C);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. MEMBER INVITATIONS
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/circles/:id/invite', () => {
  it('sends an invitation and returns the invite link', async () => {
    (db.query as jest.Mock)
      // requirePermission → owner
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      // checkMemberLimit → getCircleTier
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'free', subscription_expires_at: null }], rowCount: 1 })
      // checkMemberLimit → COUNT (1 of 3 slots used)
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      // check existing member
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // check pending invitation
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // INSERT invitation
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', email: 'new@example.com', role: 'caregiver', expires_at: new Date() }], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/invite`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ email: 'new@example.com', role: 'caregiver' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invitation.inviteLink).toMatch(/^\/invite\//);
  });

  it('returns 402 when the free tier member limit is reached', async () => {
    (db.query as jest.Mock)
      // requirePermission → owner
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      // getCircleTier → free
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'free', subscription_expires_at: null }], rowCount: 1 })
      // COUNT → 3 (at free-tier limit)
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/invite`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ email: 'another@example.com', role: 'caregiver' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('MEMBER_LIMIT_EXCEEDED');
    expect(res.body.tier).toBe('free');
  });

  it('returns 400 for an invalid role', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 }); // permission check

    const res = await req.post(`/api/care/circles/${C}/invite`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ email: 'new@example.com', role: 'superuser' });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. VAULT — MEDICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Vault: Medications', () => {
  it('POST — creates a medication entry', async () => {
    (db.query as jest.Mock)
      // requirePermission
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      // requireVaultCapacity → getCircleTier
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'free', subscription_expires_at: null }], rowCount: 1 })
      // requireVaultCapacity → COUNT (under limit)
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
      // INSERT medication
      .mockResolvedValueOnce({ rows: [{ id: MED_ID, name: 'Aspirin', circle_id: C }], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/vault/medications`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ name: 'Aspirin', dosage: '100mg', frequency: 'daily', timing: ['morning'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.medication.name).toBe('Aspirin');
  });

  it('POST — returns 402 when vault capacity is exhausted', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'free', subscription_expires_at: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 }); // at free-tier cap

    const res = await req.post(`/api/care/circles/${C}/vault/medications`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ name: 'Metformin', dosage: '500mg', frequency: 'twice daily' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('VAULT_LIMIT_EXCEEDED');
  });

  it('GET — lists medications with pagination', async () => {
    (db.query as jest.Mock)
      // vaultListRoute member check
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 })
      // COUNT
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      // SELECT *
      .mockResolvedValueOnce({ rows: [{ id: MED_ID, name: 'Aspirin', circle_id: C }], rowCount: 1 });

    const res = await req.get(`/api/care/circles/${C}/vault/medications`)
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. VAULT — DOCUMENTS (file encryption)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Vault: Documents', () => {
  const FILE_DATA_B64 = Buffer.from('PDF file content here').toString('base64');

  it('POST — encrypts and stores fileData, returns hasFile: true', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })   // permission
      .mockResolvedValueOnce({ rows: [{ subscription_tier: 'free', subscription_expires_at: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }) // vault count
      .mockResolvedValueOnce({ rows: [{ id: DOC_ID, title: 'Passport', circle_id: C, file_data_encrypted: 'encrypted-blob' }], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/vault/documents`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ title: 'Passport', type: 'id_proof', fileData: FILE_DATA_B64 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.document.hasFile).toBe(true);
    // Raw encrypted blob must NOT be exposed in the response
    expect(res.body.document.file_data_encrypted).toBeUndefined();
  });

  it('GET .../file — returns decrypted file content to authorised members', async () => {
    // Use a real encrypt/decrypt round-trip so the decryption check works
    const crypto = require('crypto');
    const KEY = Buffer.from('0'.repeat(64), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const encrypted = Buffer.concat([cipher.update(FILE_DATA_B64, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const storedBlob = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;

    (db.query as jest.Mock)
      // requirePermission('canViewDocuments') member check
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      // SELECT document with file
      .mockResolvedValueOnce({ rows: [{ title: 'Passport', file_name: 'passport.pdf', file_type: 'application/pdf', file_data_encrypted: storedBlob, is_sensitive: false }], rowCount: 1 });

    const res = await req.get(`/api/care/circles/${C}/vault/documents/${DOC_ID}/file`)
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fileData).toBe(FILE_DATA_B64);
    expect(res.body.fileType).toBe('application/pdf');
  });

  it('GET .../file — returns 404 when no file is attached', async () => {
    (db.query as jest.Mock)
      // requirePermission('canViewDocuments') member check
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 })
      // SELECT document — no file
      .mockResolvedValueOnce({ rows: [{ title: 'Empty Doc', file_data_encrypted: null, is_sensitive: false }], rowCount: 1 });

    const res = await req.get(`/api/care/circles/${C}/vault/documents/${DOC_ID}/file`)
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no file/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. INVITATION ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/invitations/:token/accept', () => {
  it('logs in an existing user and adds them to the circle', async () => {
    (db.query as jest.Mock)
      // Find invitation
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', email: 'existing@example.com', role: 'caregiver', circle_id: C, name: 'Existing', relationship: null, created_at: new Date(), expires_at: new Date(Date.now() + 86400000), circle_name: 'Test' }], rowCount: 1 })
      // Check existing user
      .mockResolvedValueOnce({ rows: [mockUser({ email: 'existing@example.com' })], rowCount: 1 })
      // Get circle info
      .mockResolvedValueOnce({ rows: [mockCircle()], rowCount: 1 });

    const res = await req.post(`/api/care/invitations/${INV_TOKEN}/accept`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.circle.id).toBe(C);
  });

  it('creates a new account with is_verified=true for invitation-created users', async () => {
    (db.query as jest.Mock)
      // Find invitation
      .mockResolvedValueOnce({ rows: [{ id: 'inv-2', email: 'new@example.com', role: 'caregiver', circle_id: C, name: 'New Person', relationship: null, created_at: new Date(), expires_at: new Date(Date.now() + 86400000), circle_name: 'Test' }], rowCount: 1 })
      // No existing user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // INSERT new user — verify is_verified=true is baked into the SQL literal
      .mockImplementationOnce(async (sql: string, _params: any[]) => {
        expect(sql).toContain('is_verified');
        expect(sql.toLowerCase()).toContain('true'); // hardcoded in VALUES ($1,$2,$3,true)
        return { rows: [{ id: 'new-user-id', email: 'new@example.com', name: 'New Person' }], rowCount: 1 };
      })
      // Get circle info
      .mockResolvedValueOnce({ rows: [mockCircle()], rowCount: 1 });

    const res = await req.post(`/api/care/invitations/${INV_TOKEN}/accept`)
      .send({ password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when password is missing for a new account', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'inv-3', email: 'brand-new@example.com', role: 'viewer', circle_id: C, name: 'Brand', expires_at: new Date(Date.now() + 86400000) }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no existing user

    const res = await req.post(`/api/care/invitations/${INV_TOKEN}/accept`).send({});
    expect(res.status).toBe(400);
    expect(res.body.needsPassword).toBe(true);
  });

  it('returns 404 for an unknown token', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await req.post('/api/care/invitations/bad-token/accept').send({});
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. BIDIRECTIONAL SYNC
// ═══════════════════════════════════════════════════════════════════════════════
describe('Sync endpoints', () => {
  it('POST /sync — accepts changes and returns applied count', async () => {
    (db.query as jest.Mock)
      // member check
      .mockResolvedValueOnce({ rows: [mockMember()], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/sync`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ changes: [] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sync — returns 400 when changes is not an array', async () => {
    const res = await req.post(`/api/care/circles/${C}/sync`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ changes: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('GET /sync — returns vault data snapshot (medications, notes, etc.)', async () => {
    // GET sync handler: 1 member check + 6 concurrent vault queries (owner sees all)
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 }) // member check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // medications
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // doctors
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // appointments
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // contacts
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // notes
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // accounts

    const res = await req.get(`/api/care/circles/${C}/sync`)
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('medications');
    expect(res.body).toHaveProperty('accounts');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/care/flags/evaluate', () => {
  it('returns a flag evaluation map for the calling user', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [
          { name: 'ai_memory', is_enabled: true, enabled_for_all: true, rollout_percentage: 100, enabled_user_ids: [], enabled_circle_ids: [] },
          { name: 'beta_feature', is_enabled: true, enabled_for_all: false, rollout_percentage: 0, enabled_user_ids: [], enabled_circle_ids: [] },
        ],
        rowCount: 2,
      });

    const res = await req.post('/api/care/flags/evaluate')
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ circleId: C });

    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveProperty('ai_memory', true);
    expect(res.body.flags).toHaveProperty('beta_feature', false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin Auth', () => {
  it('POST /auth/login — returns admin token and sets cookie', async () => {
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const adminHash = bcrypt.hashSync('adminpass123', 1);

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'super_admin', password_hash: adminHash, permissions: { canManageSettings: true } }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE last_login_at

    const res = await req.post('/api/admin/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'admin@example.com', password: 'adminpass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('POST /auth/login — returns 401 for wrong credentials', async () => {
    const bcrypt = require('../../server/node_modules/bcryptjs');
    const adminHash = bcrypt.hashSync('adminpass123', 1);

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', email: 'admin@example.com', role: 'super_admin', password_hash: adminHash }], rowCount: 1 });

    const res = await req.post('/api/admin/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'admin@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout — clears admin cookie', async () => {
    const res = await req.post('/api/admin/auth/logout')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. ADMIN — USERS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin User Management', () => {
  it('GET /users — returns paginated user list', async () => {
    // Admin handler: SELECT users FIRST, then COUNT
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockUser(), mockUser({ id: 'u2', email: 'b@b.com' })], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });

    const res = await req.get('/api/admin/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
  });

  it('GET /users — returns 401 without admin token', async () => {
    const res = await req.get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('POST /users/:id/suspend — suspends the user and logs the action', async () => {
    (db.query as jest.Mock)
      // SELECT user (oldResult)
      .mockResolvedValueOnce({ rows: [mockUser()], rowCount: 1 })
      // UPDATE users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // INSERT audit log falls through to default mock ({ rows: [], rowCount: 0 })

    const res = await req.post(`/api/admin/users/${U}/suspend`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Violation of terms' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. ADMIN — CIRCLES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Admin Circle Management', () => {
  it('GET /circles — returns paginated circle list', async () => {
    // Admin handler: SELECT circles FIRST, then COUNT
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [mockCircle(), mockCircle({ id: 'c2', name: 'Circle 2' })], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

    const res = await req.get('/api/admin/circles')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.circles).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. PERMISSION ENFORCEMENT (cross-cutting)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Permission enforcement', () => {
  it('returns 403 when a viewer tries to invite a member', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ ...mockMember(), role: 'viewer' }], rowCount: 1 });

    const res = await req.post(`/api/care/circles/${C}/invite`)
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ email: 'x@x.com', role: 'caregiver' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permission denied/i);
  });

  it('returns 403 when a non-member tries to access vault', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // not a member

    const res = await req.get(`/api/care/circles/${C}/vault/medications`)
      .set('Authorization', `Bearer ${USER_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

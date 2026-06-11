/**
 * Care Circle API Module
 *
 * Handles caregiver authentication, care circle management,
 * invitations, and sync operations.
 *
 * Now using PostgreSQL for persistent storage.
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const db = require('./db');
const realtime = require('./realtime');
const router = express.Router();

// Cross-instance realtime: deliver events published by other gateway instances
// to this instance's WebSocket clients. No-op unless REDIS_URL is configured.
realtime.init((circleId, event) => deliverToLocalCircle(circleId, event));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Karuna <noreply@karunaapp.in>';

const BCRYPT_ROUNDS = 12;

// ============================================================================
// Vault field encryption (AES-256-GCM)
// ============================================================================

const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY
  ? Buffer.from(process.env.VAULT_ENCRYPTION_KEY, 'hex')
  : null;

if (!VAULT_KEY || VAULT_KEY.length !== 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Vault] VAULT_ENCRYPTION_KEY must be set to a 32-byte hex string in production');
  }
  console.warn('[Vault] VAULT_ENCRYPTION_KEY not set or invalid — account numbers stored unencrypted');
}

function encryptField(plaintext) {
  if (!VAULT_KEY || !plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptField(stored) {
  if (!VAULT_KEY || !stored) return stored;
  const parts = stored.split(':');
  // If not in encrypted format, return as-is (plaintext legacy value)
  if (parts.length !== 3) return stored;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const data = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    return stored;
  }
}

function decryptAccount(row) {
  if (!row) return row;
  return { ...row, account_number_encrypted: decryptField(row.account_number_encrypted) };
}

// Strip file_data_encrypted from list responses; expose hasFile so clients know whether to fetch it
function stripDocumentFileData(row) {
  if (!row) return row;
  const { file_data_encrypted, ...rest } = row;
  return { ...rest, hasFile: !!file_data_encrypted };
}

// ============================================================================
// Subscription Tier Limits
// ============================================================================

const TIER_LIMITS = {
  free: {
    maxMembers: 3,
    maxVaultItemsPerCategory: 50,
    maxCircles: 1,
  },
  premium: {
    maxMembers: 15,
    maxVaultItemsPerCategory: 500,
    maxCircles: 5,
  },
  enterprise: {
    maxMembers: 50,
    maxVaultItemsPerCategory: Infinity,
    maxCircles: Infinity,
  },
};

async function getCircleTier(circleId) {
  const result = await db.query(
    'SELECT subscription_tier, subscription_expires_at FROM care_circles WHERE id = $1',
    [circleId]
  );
  if (result.rows.length === 0) return 'free';
  const { subscription_tier, subscription_expires_at } = result.rows[0];
  if (subscription_expires_at && new Date(subscription_expires_at) < new Date()) return 'free';
  return subscription_tier || 'free';
}

async function checkMemberLimit(circleId) {
  const tier = await getCircleTier(circleId);
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  const countResult = await db.query(
    'SELECT COUNT(*) FROM circle_members WHERE circle_id = $1',
    [circleId]
  );
  const count = parseInt(countResult.rows[0].count);
  if (count >= limits.maxMembers) {
    return { allowed: false, limit: limits.maxMembers, tier };
  }
  return { allowed: true };
}

async function checkVaultLimit(circleId, table) {
  const tier = await getCircleTier(circleId);
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  if (limits.maxVaultItemsPerCategory === Infinity) return { allowed: true };
  const countResult = await db.query(
    `SELECT COUNT(*) FROM ${table} WHERE circle_id = $1`,
    [circleId]
  );
  const count = parseInt(countResult.rows[0].count);
  if (count >= limits.maxVaultItemsPerCategory) {
    return { allowed: false, limit: limits.maxVaultItemsPerCategory, tier };
  }
  return { allowed: true };
}

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

// Login rate limiter: 5 attempts per minute per IP
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many login attempts, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Login rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// Registration rate limiter: 3 attempts per hour per IP
const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Registration rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// Invitation rate limiter: 10 attempts per minute per IP
const invitationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Too many invitation attempts, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Invitation rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// Password reset rate limiter: 3 attempts per hour per IP
const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many password reset attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// ============================================================================
// Configuration
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
const INVITATION_EXPIRES_HOURS = 72;
const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3020';

// Role permissions
const ROLE_PERMISSIONS = {
  owner: {
    canViewAccounts: true,
    canEditAccounts: true,
    canViewMedications: true,
    canEditMedications: true,
    canViewDocuments: true,
    canEditDocuments: true,
    canViewDoctors: true,
    canEditDoctors: true,
    canViewAppointments: true,
    canEditAppointments: true,
    canViewContacts: true,
    canEditContacts: true,
    canViewVault: true,
    canViewSensitive: true,
    canAddNotes: true,
    canViewAllNotes: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canExportData: true,
    canEditCircle: true,
    canDeleteCircle: true,
    canApproveRecovery: true,
  },
  caregiver: {
    canViewAccounts: true,
    canEditAccounts: false,
    canViewMedications: true,
    canEditMedications: true,
    canViewDocuments: true,
    canEditDocuments: false,
    canViewDoctors: true,
    canEditDoctors: true,
    canViewAppointments: true,
    canEditAppointments: true,
    canViewContacts: true,
    canEditContacts: true,
    canViewVault: true,
    canViewSensitive: false,
    canAddNotes: true,
    canViewAllNotes: true,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canExportData: true,
    canEditCircle: false,
    canDeleteCircle: false,
    canApproveRecovery: true,
  },
  viewer: {
    canViewAccounts: false,
    canEditAccounts: false,
    canViewMedications: true,
    canEditMedications: false,
    canViewDocuments: false,
    canEditDocuments: false,
    canViewDoctors: true,
    canEditDoctors: false,
    canViewAppointments: true,
    canEditAppointments: false,
    canViewContacts: true,
    canEditContacts: false,
    canViewVault: true,
    canViewSensitive: false,
    canAddNotes: true,
    canViewAllNotes: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canExportData: false,
    canEditCircle: false,
    canDeleteCircle: false,
    canApproveRecovery: false,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendVerificationEmail(email, name, verificationUrl) {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping verification email to:', email);
    return;
  }
  const firstName = name.split(' ')[0];
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Verify your Karuna account',
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f5f5f5;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px">
    <h1 style="color:#2563eb;margin-top:0">Welcome to Karuna, ${firstName}!</h1>
    <p style="color:#374151;line-height:1.6">
      Thank you for joining Karuna — your personal AI care companion. Please verify
      your email address to activate your account.
    </p>
    <a href="${verificationUrl}"
       style="display:inline-block;margin:24px 0;padding:14px 28px;background:#2563eb;
              color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
      Verify Email Address
    </a>
    <p style="color:#6b7280;font-size:14px">
      This link expires in 24 hours. If you didn't create a Karuna account, you can
      safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:12px">
      Karuna Care &bull; <a href="https://karunaapp.in" style="color:#9ca3af">karunaapp.in</a>
    </p>
  </div>
</body>
</html>`,
  });
}

async function sendPasswordResetEmail(email, name, resetUrl) {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping password reset email to:', email);
    return;
  }
  const firstName = name.split(' ')[0];
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your Karuna password',
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f5f5f5;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px">
    <h1 style="color:#2563eb;margin-top:0">Password Reset</h1>
    <p style="color:#374151;line-height:1.6">
      Hi ${firstName}, we received a request to reset your Karuna account password.
      Click the button below to choose a new password.
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;margin:24px 0;padding:14px 28px;background:#dc2626;
              color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
      Reset Password
    </a>
    <p style="color:#6b7280;font-size:14px">
      This link expires in 1 hour. If you didn't request a password reset, please
      ignore this email — your password will not change.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:12px">
      Karuna Care &bull; <a href="https://karunaapp.in" style="color:#9ca3af">karunaapp.in</a>
    </p>
  </div>
</body>
</html>`,
  });
}

// Ensure password_reset_tokens table exists (idempotent)
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('[DB] Failed to create password_reset_tokens table:', err.message);
  }
})();

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash, userId = null) {
  if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
    return bcrypt.compare(password, hash);
  } else {
    // Legacy SHA-256 hash - verify and auto-upgrade to bcrypt
    const legacyHash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    const matches = hash === legacyHash;
    if (matches && userId) {
      // Auto-upgrade to bcrypt on successful login
      console.warn(`[Security] Upgrading legacy SHA-256 hash to bcrypt for user ${userId}`);
      try {
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
      } catch (err) {
        console.error('[Security] Failed to upgrade password hash:', err.message);
      }
    }
    return matches;
  }
}

function createJWT(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    // Log JWT verification failures for security monitoring
    if (error.name === 'TokenExpiredError') {
      console.warn('[Auth] JWT expired:', { expiredAt: error.expiredAt });
    } else if (error.name === 'JsonWebTokenError') {
      console.warn('[Auth] Invalid JWT:', { message: error.message });
    } else if (error.name === 'NotBeforeError') {
      console.warn('[Auth] JWT not yet valid:', { date: error.date });
    } else {
      console.warn('[Auth] JWT verification failed:', { error: error.message });
    }
    return null;
  }
}

// ============================================================================
// Cookie helpers
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const AUTH_COOKIE_NAME = 'karuna_auth';
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

function authMiddleware(req, res, next) {
  // Prefer httpOnly cookie; fall back to Bearer header for mobile/API clients
  let token = getCookie(req, AUTH_COOKIE_NAME);
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyJWT(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

// CSRF validation middleware (double-submit cookie pattern)
// Applies to mutating requests authenticated via cookie.
// API clients using Bearer-only auth (no cookie) are exempt.
function csrfMiddleware(req, res, next) {
  // Only validate when the request was authenticated via cookie
  // (Bearer-token-only clients don't carry cookies, so they can't be CSRF'd)
  const hasCookie = !!getCookie(req, AUTH_COOKIE_NAME);
  if (!hasCookie) return next();

  const cookieToken = getCookie(req, 'csrf-token');
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
}

// Permission check middleware
function requirePermission(permission) {
  return async (req, res, next) => {
    const { circleId } = req.params;

    try {
      // Get member info
      const memberResult = await db.query(
        `SELECT cm.*, u.email, u.name
         FROM circle_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.circle_id = $1 AND cm.user_id = $2`,
        [circleId, req.user.id]
      );

      if (memberResult.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this circle' });
      }

      const member = memberResult.rows[0];
      const permissions = ROLE_PERMISSIONS[member.role];

      if (!permissions[permission]) {
        return res.status(403).json({ error: 'Permission denied' });
      }

      req.member = member;
      req.permissions = permissions;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Failed to check permissions' });
    }
  };
}

// ============================================================================
// Consent Enforcement
// ============================================================================

// Maps vault entity types and API route identifiers to consent categories.
// Owners (patients) are never blocked by consent — they control their own data.
const VAULT_CONSENT_CATEGORY = {
  vault_medications:   'health_data',
  vault_doctors:       'health_data',
  vault_appointments:  'health_data',
  vault_contacts:      'contact_info',
  vault_accounts:      'financial_data',
  vault_documents:     'personal_documents',
  health_data:         'health_data',
};

// Role → grantee name as stored in consent records
const ROLE_TO_GRANTEE = {
  owner:     'caregiver_owner',
  caregiver: 'caregiver_member',
  viewer:    'caregiver_member',
};

/**
 * Checks whether the member's role has been granted access to `category`
 * according to the patient's stored consent preferences.
 * Returns true (allow) when:
 *  - The member is the owner (patient controls their own data)
 *  - patient_consent is empty / not yet synced (fail-open for backward compat)
 *  - globalDataSharing is true AND the category has no explicit denial
 *  - An explicit ConsentRecord grants read (or higher) access to the grantee
 */
function checkConsent(consentData, role, category) {
  if (role === 'owner') return true;
  if (!consentData || Object.keys(consentData).length === 0) return true; // not yet synced

  const grantee = ROLE_TO_GRANTEE[role] || 'caregiver_member';

  // Global sharing off means deny everything unless explicitly granted
  const globalDataSharing = consentData.globalDataSharing === true;

  const consents = Array.isArray(consentData.consents) ? consentData.consents : [];

  // Find an active, non-expired grant for this category+grantee
  const now = new Date();
  const activeGrant = consents.find(c =>
    c.category === category &&
    c.grantee === grantee &&
    c.accessLevel !== 'none' &&
    (!c.revokedAt) &&
    (!c.expiresAt || new Date(c.expiresAt) > now)
  );

  if (activeGrant) return true;
  if (globalDataSharing) {
    // Global sharing on: allow unless this category is explicitly revoked
    const explicitRevoke = consents.find(c =>
      c.category === category && c.grantee === grantee && c.accessLevel === 'none'
    );
    return !explicitRevoke;
  }

  return false;
}

/**
 * Express middleware: reads patient_consent from care_circles and blocks
 * non-owner members whose access to `category` has been denied by the patient.
 */
// Consent gating notes (intentional scope):
//  - This guards READ access to a patient's shared categories. Vault WRITE
//    endpoints and POST /sync are deliberately NOT consent-gated: consent governs
//    the patient sharing THEIR data for caregivers to read, whereas caregiver
//    edits are a separate authorization concern (role permissions). Revisit if
//    product wants writes gated too.
//  - checkConsent() intentionally allows access when patient_consent is empty
//    (backward-compat default). Flipping that to deny would block caregivers on
//    every circle until its patient re-syncs consent, so it's a rollout decision.
function requireConsent(category) {
  return async (req, res, next) => {
    try {
      const { circleId } = req.params;

      const memberResult = await db.query(
        'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
        [circleId, req.user.id]
      );
      if (memberResult.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of this circle' });
      }

      const { role } = memberResult.rows[0];

      // Owners always pass — they control the data
      if (role === 'owner') return next();

      const circleResult = await db.query(
        'SELECT patient_consent FROM care_circles WHERE id = $1',
        [circleId]
      );
      const consentData = circleResult.rows[0]?.patient_consent || {};

      if (!checkConsent(consentData, role, category)) {
        return res.status(403).json({ error: 'Access denied: patient has not granted consent for this data category' });
      }

      next();
    } catch (error) {
      // Fail CLOSED: a consent gate must not grant access to health/financial/
      // contact/document data when it cannot verify consent — a transient DB
      // error must never become an authorization bypass (was fail-open before).
      console.error('Consent check error:', error);
      return res.status(503).json({ error: 'Unable to verify data-sharing consent. Please try again.' });
    }
  };
}

// ============================================================================
// Global CSRF enforcement for all mutating routes
// ============================================================================

// Apply CSRF validation to POST/PUT/PATCH/DELETE across all routes.
// The csrfMiddleware itself skips requests that do not carry the auth cookie
// (e.g. login, register, accept-invitation), so this is safe to apply globally.
router.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return csrfMiddleware(req, res, next);
  }
  next();
});

// ============================================================================
// Auth Routes
// ============================================================================

// Register caregiver
router.post('/auth/register', registrationRateLimiter, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user with email_verification_token_hash
    const passwordHash = await hashPassword(password);
    const verificationToken = generateToken();
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, is_verified, email_verification_token_hash, email_verification_expires_at)
       VALUES ($1, $2, $3, $4, false, $5, $6)
       RETURNING id, email, name`,
      [email.toLowerCase(), passwordHash, name, phone, hashToken(verificationToken), verificationExpiresAt]
    );

    const user = result.rows[0];
    const verificationUrl = `${APP_BASE_URL}/verify-email/${verificationToken}`;
    // Best-effort: the user row is already committed. If the verification email
    // throws (e.g. Resend configured but erroring), don't 500 the registration —
    // that left an orphan unverified account the client believed had failed, and
    // the 3/hr limiter then blocked retry. The email can be re-sent later.
    try {
      await sendVerificationEmail(user.email, user.name, verificationUrl);
    } catch (emailErr) {
      console.warn('[register] verification email send failed:', emailErr.message);
    }

    const token = createJWT(user);

    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    // Set readable CSRF token cookie (non-httpOnly, for the double-submit pattern)
    res.cookie('csrf-token', crypto.randomUUID(), {
      httpOnly: false,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
      emailVerified: false,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/auth/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query(
      'SELECT id, email, name, password_hash, is_verified, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      return res.status(401).json({ error: 'Account is suspended. Contact support.' });
    }

    const passwordValid = await verifyPassword(password, user.password_hash, user.id);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Upgrade legacy hash to bcrypt on successful login
    if (!user.password_hash.startsWith('$2b$') && !user.password_hash.startsWith('$2a$')) {
      const newHash = await hashPassword(password);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }

    const token = createJWT(user);

    // Get user's circles
    const circlesResult = await db.query(
      `SELECT cc.*, cm.role
       FROM care_circles cc
       JOIN circle_members cm ON cc.id = cm.circle_id
       WHERE cm.user_id = $1`,
      [user.id]
    );

    // Update login stats
    await db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, login_count = COALESCE(login_count, 0) + 1 WHERE id = $1',
      [user.id]
    );

    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
    // Set readable CSRF token cookie (non-httpOnly, for the double-submit pattern)
    res.cookie('csrf-token', crypto.randomUUID(), {
      httpOnly: false,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
      circles: circlesResult.rows,
      emailVerified: user.is_verified || false,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout — clears httpOnly auth cookie and CSRF token cookie
router.post('/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/',
  });
  res.clearCookie('csrf-token', {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    path: '/',
  });
  res.json({ success: true });
});

// Verify email address
router.post('/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(
      `SELECT id, email, name, is_verified
       FROM users
       WHERE email_verification_token_hash = $1
         AND email_verification_expires_at > CURRENT_TIMESTAMP`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.json({ success: true, alreadyVerified: true });
    }

    await db.query(
      `UPDATE users
       SET is_verified = true, email_verification_token_hash = NULL, email_verification_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification email
router.post('/auth/resend-verification', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, is_verified FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    const verificationToken = generateToken();
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000);

    await db.query(
      'UPDATE users SET email_verification_token_hash = $1, email_verification_expires_at = $2 WHERE id = $3',
      [hashToken(verificationToken), verificationExpiresAt, user.id]
    );

    const verificationUrl = `${APP_BASE_URL}/verify-email/${verificationToken}`;
    await sendVerificationEmail(user.email, user.name, verificationUrl);

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Forgot password — generate and store a reset token
router.post('/auth/forgot-password', passwordResetRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await db.query('SELECT id, email, name FROM users WHERE email = $1', [email.toLowerCase()]);

    // Always respond the same way to prevent user enumeration
    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If that email is registered, you will receive a reset link.' });
    }

    const user = result.rows[0];
    const resetToken = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(resetToken), expiresAt]
    );

    const resetUrl = `${APP_BASE_URL}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    const response = { success: true, message: 'If that email is registered, you will receive a reset link.' };
    // Expose token in non-production so it can be used without email
    if (process.env.NODE_ENV !== 'production') {
      response.resetToken = resetToken;
      response.resetUrl = resetUrl;
    }
    res.json(response);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password — validate token and update password
router.post('/auth/reset-password', passwordResetRateLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const result = await db.query(
      `SELECT prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1 AND prt.expires_at > CURRENT_TIMESTAMP`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const { user_id, email } = result.rows[0];
    const passwordHash = await hashPassword(password);

    await db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [passwordHash, user_id]);
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user_id]);

    console.log(`[Security] Password reset completed for: ${email}`);
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get current user
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, is_verified FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user's circles
    const circlesResult = await db.query(
      `SELECT cc.*, cm.role
       FROM care_circles cc
       JOIN circle_members cm ON cc.id = cm.circle_id
       WHERE cm.user_id = $1`,
      [user.id]
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      circles: circlesResult.rows,
      emailVerified: user.is_verified || false,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// ============================================================================
// GDPR — Data export & account deletion
// ============================================================================

const gdprRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many data requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // The export/delete flows are exercised repeatedly by the realdb suite from
  // one IP; unlike login/registration these can't be seeded around.
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] GDPR rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// GDPR right of access: download everything we hold about the authenticated
// user as JSON. Owned circles include full circle data (the owner is the
// circle's data custodian); for circles where the user is only a member, just
// the membership and their own authored notes are included. Document file
// contents are omitted (metadata only) to keep the export portable — files
// remain downloadable via the documents endpoint.
router.get('/auth/export', gdprRateLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const profileResult = await db.query(
      `SELECT id, email, name, phone, is_verified, created_at, last_login_at, login_count
       FROM users WHERE id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const memberships = (await db.query(
      `SELECT cm.circle_id, cc.name AS circle_name, cc.care_recipient_name, cm.role,
              cm.relationship, cm.joined_at
       FROM circle_members cm JOIN care_circles cc ON cc.id = cm.circle_id
       WHERE cm.user_id = $1`,
      [userId]
    )).rows;

    const EXPORT_ROW_CAP = 10000;
    const ownedCircles = [];
    for (const m of memberships.filter((row) => row.role === 'owner')) {
      const circleId = m.circle_id;
      const q = (sql) => db.query(sql, [circleId]).then((r) => r.rows);
      const [members, medications, doctors, appointments, contacts, accounts, documents, routines,
             notes, health, doses, activity, checkins, alerts] = await Promise.all([
        q(`SELECT u.name, cm.role, cm.relationship, cm.joined_at
           FROM circle_members cm JOIN users u ON u.id = cm.user_id WHERE cm.circle_id = $1`),
        q('SELECT * FROM vault_medications WHERE circle_id = $1'),
        q('SELECT * FROM vault_doctors WHERE circle_id = $1'),
        q('SELECT * FROM vault_appointments WHERE circle_id = $1'),
        q('SELECT * FROM vault_contacts WHERE circle_id = $1'),
        q('SELECT * FROM vault_accounts WHERE circle_id = $1'),
        q(`SELECT id, title, type, description, file_name, file_type, file_size, expiry_date,
                  is_sensitive, created_at FROM vault_documents WHERE circle_id = $1`),
        q('SELECT * FROM vault_routines WHERE circle_id = $1'),
        q('SELECT * FROM vault_notes WHERE circle_id = $1'),
        q(`SELECT data_type, value, unit, measured_at, source, notes FROM health_data
           WHERE circle_id = $1 ORDER BY measured_at DESC LIMIT ${EXPORT_ROW_CAP}`),
        q(`SELECT medication_id, scheduled_time, status, taken_at, skipped_reason FROM medication_doses
           WHERE circle_id = $1 ORDER BY scheduled_time DESC LIMIT ${EXPORT_ROW_CAP}`),
        q(`SELECT activity_type, details, recorded_at, source FROM activity_logs
           WHERE circle_id = $1 ORDER BY recorded_at DESC LIMIT ${EXPORT_ROW_CAP}`),
        q(`SELECT checkin_type, message, response, response_text, responded_at FROM checkin_logs
           WHERE circle_id = $1 ORDER BY created_at DESC LIMIT ${EXPORT_ROW_CAP}`),
        q(`SELECT alert_type, severity, title, message, status, created_at FROM caregiver_alerts
           WHERE circle_id = $1 ORDER BY created_at DESC LIMIT ${EXPORT_ROW_CAP}`),
      ]);
      const circleRow = (await db.query(
        'SELECT id, name, care_recipient_name, settings, patient_consent, subscription_tier, created_at FROM care_circles WHERE id = $1',
        [circleId]
      )).rows[0];
      ownedCircles.push({
        circle: circleRow,
        members,
        vault: {
          medications,
          doctors,
          appointments,
          contacts,
          accounts: accounts.map((a) => ({
            ...a,
            account_number: decryptField(a.account_number_encrypted),
            account_number_encrypted: undefined,
          })),
          documents,
          routines,
          notes,
        },
        health: { measurements: health, medicationDoses: doses },
        activity,
        checkins,
        alerts,
      });
    }

    const notesAuthored = (await db.query(
      `SELECT circle_id, title, content, category, priority, created_at
       FROM vault_notes WHERE author_id = $1`,
      [userId]
    )).rows;
    const auditTrail = (await db.query(
      `SELECT action, category, description, created_at FROM audit_logs
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
      [userId]
    )).rows;

    db.query(
      `INSERT INTO audit_logs (user_id, action, category, description, metadata, ip_address, user_agent)
       VALUES ($1, 'data_exported', 'auth', 'User downloaded a GDPR data export', '{}', $2, $3)`,
      [userId, req.ip, req.headers['user-agent']]
    ).catch(() => {});

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="karuna-data-export-${stamp}.json"`);
    res.json({
      format: 'karuna-gdpr-export/v1',
      exportedAt: new Date().toISOString(),
      profile: profileResult.rows[0],
      memberships,
      ownedCircles,
      notesAuthored,
      auditTrail,
      notes: 'Document file contents are not embedded; download them individually from the documents section.',
    });
  } catch (error) {
    console.error('Data export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// GDPR right to erasure: delete the account and everything owned by it.
// Requires the current password. When the user owns circles, the request must
// also set confirmDeleteOwnedCircles=true — deleting an owned circle removes
// that circle's data for every member, which deserves an explicit second step.
// References from circles the user does NOT own are anonymized, not deleted
// (the circle's data belongs to its own members).
router.post('/auth/delete-account', gdprRateLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password, confirmDeleteOwnedCircles } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password is required' });

    const userResult = await db.query('SELECT id, email, password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!(await verifyPassword(password, userResult.rows[0].password_hash, userId))) {
      return res.status(403).json({ error: 'Incorrect password' });
    }

    const owned = (await db.query(
      `SELECT cc.id, cc.name,
              (SELECT COUNT(*)::int FROM circle_members WHERE circle_id = cc.id) AS member_count
       FROM care_circles cc JOIN circle_members cm ON cm.circle_id = cc.id
       WHERE cm.user_id = $1 AND cm.role = 'owner'`,
      [userId]
    )).rows;

    if (owned.length > 0 && confirmDeleteOwnedCircles !== true) {
      return res.status(409).json({
        error: 'You own care circles. Deleting your account permanently deletes them for all members.',
        ownedCircles: owned.map((c) => ({ id: c.id, name: c.name, memberCount: c.member_count })),
        confirmationRequired: 'confirmDeleteOwnedCircles',
      });
    }

    await db.transaction(async (client) => {
      const ownedIds = owned.map((c) => c.id);
      if (ownedIds.length > 0) {
        // Cascades wipe all circle-scoped data (vault, health, alerts, sync…).
        await client.query('DELETE FROM care_circles WHERE id = ANY($1)', [ownedIds]);
      }
      // Remaining references from circles the user does not own.
      await client.query('DELETE FROM invitations WHERE invited_by = $1', [userId]);
      await client.query('DELETE FROM vault_notes WHERE author_id = $1', [userId]);
      await client.query('UPDATE vault_notes SET resolved_by = NULL WHERE resolved_by = $1', [userId]);
      await client.query(
        "UPDATE sync_changes SET changed_by = NULL, changed_by_name = 'Deleted user' WHERE changed_by = $1",
        [userId]
      );
      await client.query('UPDATE caregiver_alerts SET acknowledged_by = NULL WHERE acknowledged_by = $1', [userId]);
      await client.query('UPDATE vault_recovery_escrow SET approved_by = NULL WHERE approved_by = $1', [userId]);
      await client.query('UPDATE ai_usage_logs SET user_id = NULL WHERE user_id = $1', [userId]);
      await client.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [userId]);
      // Cascades remove memberships, sessions, reset tokens, own escrow rows.
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query(
        `INSERT INTO audit_logs (user_id, action, category, description, metadata, ip_address, user_agent)
         VALUES (NULL, 'account_deleted', 'auth', 'User account deleted (GDPR request)', $1, $2, $3)`,
        [JSON.stringify({ ownedCirclesDeleted: ownedIds.length }), req.ip, req.headers['user-agent']]
      );
    });

    console.log(`[Security] Account deleted (GDPR): ${userResult.rows[0].email}`);
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      path: '/',
    });
    res.clearCookie('csrf-token', {
      httpOnly: false,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'none' : 'lax',
      path: '/',
    });
    res.json({ success: true, message: 'Your account and data have been deleted.' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================================================
// Care Circle Routes
// ============================================================================

// Create a new care circle
router.post('/circles', authMiddleware, async (req, res) => {
  try {
    const { name, elderlyName } = req.body;

    if (!name || !elderlyName) {
      return res.status(400).json({ error: 'Name and elderly name are required' });
    }

    // Use transaction to create circle and add owner
    const result = await db.transaction(async (client) => {
      // Create the circle
      const circleResult = await client.query(
        `INSERT INTO care_circles (name, care_recipient_name)
         VALUES ($1, $2)
         RETURNING *`,
        [name, elderlyName]
      );

      const circle = circleResult.rows[0];

      // Add the creator as owner
      await client.query(
        `INSERT INTO circle_members (circle_id, user_id, role, relationship)
         VALUES ($1, $2, $3, $4)`,
        [circle.id, req.user.id, 'owner', 'Primary Caregiver']
      );

      return circle;
    });

    res.json({ success: true, circle: result });
  } catch (error) {
    console.error('Create circle error:', error);
    res.status(500).json({ error: 'Failed to create circle' });
  }
});

// Get all circles for current user
router.get('/circles', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cc.*, cm.role,
              (SELECT COUNT(*) FROM circle_members WHERE circle_id = cc.id) as member_count
       FROM care_circles cc
       JOIN circle_members cm ON cc.id = cm.circle_id
       WHERE cm.user_id = $1
       ORDER BY cc.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get circles error:', error);
    res.status(500).json({ error: 'Failed to get circles' });
  }
});

// Get a specific circle
router.get('/circles/:circleId', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;

    // Get circle info
    const circleResult = await db.query(
      'SELECT * FROM care_circles WHERE id = $1',
      [circleId]
    );

    if (circleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const circle = circleResult.rows[0];

    // Check membership and get role
    const memberResult = await db.query(
      `SELECT cm.*, u.email, u.name
       FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1 AND cm.user_id = $2`,
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }

    const currentMember = memberResult.rows[0];
    const permissions = ROLE_PERMISSIONS[currentMember.role];

    // Get all members
    const allMembersResult = await db.query(
      `SELECT cm.id, cm.user_id as "userId", cm.role, cm.relationship, cm.status,
              cm.joined_at as "joinedAt", cm.last_active_at as "lastActiveAt",
              cm.notify_on_medication_changes, cm.notify_on_appointments,
              cm.notify_on_emergency, cm.notify_on_notes,
              u.email, u.name
       FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1
       ORDER BY cm.joined_at`,
      [circleId]
    );

    // Add permissions to each member
    const members = allMembersResult.rows.map(m => ({
      ...m,
      permissions: ROLE_PERMISSIONS[m.role]
    }));

    res.json({
      ...circle,
      elderlyName: circle.care_recipient_name,
      members,
      currentMember: {
        ...currentMember,
        permissions
      }
    });
  } catch (error) {
    console.error('Get circle error:', error);
    res.status(500).json({ error: 'Failed to get circle' });
  }
});

// Update care circle
router.put('/circles/:circleId', authMiddleware, requirePermission('canEditCircle'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, elderlyName } = req.body;

    if (!name && !elderlyName) {
      return res.status(400).json({ error: 'At least one field to update is required' });
    }

    const result = await db.query(
      `UPDATE care_circles
       SET name = COALESCE($1, name),
           care_recipient_name = COALESCE($2, care_recipient_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [name, elderlyName, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const updatedCircle = result.rows[0];

    res.json({
      success: true,
      circle: {
        ...updatedCircle,
        elderlyName: updatedCircle.care_recipient_name
      }
    });
  } catch (error) {
    console.error('Update circle error:', error);
    res.status(500).json({ error: 'Failed to update circle' });
  }
});

// Delete care circle
router.delete('/circles/:circleId', authMiddleware, requirePermission('canDeleteCircle'), async (req, res) => {
  try {
    const { circleId } = req.params;

    const result = await db.query(
      'DELETE FROM care_circles WHERE id = $1 RETURNING id',
      [circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete circle error:', error);
    res.status(500).json({ error: 'Failed to delete circle' });
  }
});

// ============================================================================
// Invitation Routes
// ============================================================================

// Invite a member
router.post('/circles/:circleId/invite', authMiddleware, requirePermission('canInviteMembers'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    if (!['caregiver', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check subscription tier member limit
    const memberCheck = await checkMemberLimit(circleId);
    if (!memberCheck.allowed) {
      return res.status(402).json({
        error: `Member limit reached for ${memberCheck.tier} tier (max ${memberCheck.limit}). Upgrade to add more members.`,
        code: 'MEMBER_LIMIT_EXCEEDED',
        tier: memberCheck.tier,
        limit: memberCheck.limit,
      });
    }

    // Check if already a member
    const existingMember = await db.query(
      `SELECT cm.id FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1 AND u.email = $2`,
      [circleId, email.toLowerCase()]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Check for pending invitation
    const existingInvite = await db.query(
      `SELECT id FROM invitations
       WHERE circle_id = $1 AND email = $2 AND status = 'pending'`,
      [circleId, email.toLowerCase()]
    );

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'Invitation already sent' });
    }

    // Create invitation
    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRES_HOURS * 60 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO invitations (circle_id, invited_by, email, name, role, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [circleId, req.user.id, email.toLowerCase(), email.split('@')[0], role, hashToken(token), expiresAt]
    );

    const invitation = result.rows[0];

    console.log(`Invitation created for ${email}: /invite/${token}`);

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
        inviteLink: `/invite/${token}`,
      },
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Accept invitation
router.post('/invitations/:token/accept', invitationRateLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Find invitation
    const inviteResult = await db.query(
      `SELECT i.*, cc.name as circle_name
       FROM invitations i
       JOIN care_circles cc ON i.circle_id = cc.id
       WHERE i.token_hash = $1 AND i.status = 'pending'`,
      [hashToken(token)]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    if (new Date(invitation.expires_at) < new Date()) {
      await db.query(
        "UPDATE invitations SET status = 'expired' WHERE id = $1",
        [invitation.id]
      );
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Check if user exists or create new
    let user;
    const existingUser = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [invitation.email]
    );

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
    } else {
      if (!password) {
        return res.status(400).json({ error: 'Password required for new account', needsPassword: true });
      }

      const newPasswordHash = await hashPassword(password);
      const newUserResult = await db.query(
        `INSERT INTO users (email, password_hash, name, is_verified)
         VALUES ($1, $2, $3, true)
         RETURNING id, email, name`,
        [invitation.email, newPasswordHash, invitation.name]
      );
      user = newUserResult.rows[0];
    }

    // Add to circle and update invitation
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO circle_members (circle_id, user_id, role, relationship, invited_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (circle_id, user_id) DO NOTHING`,
        [invitation.circle_id, user.id, invitation.role, invitation.relationship, invitation.created_at]
      );

      await client.query(
        "UPDATE invitations SET status = 'accepted' WHERE id = $1",
        [invitation.id]
      );
    });

    const authToken = createJWT(user);

    // Get circle info
    const circleResult = await db.query(
      'SELECT * FROM care_circles WHERE id = $1',
      [invitation.circle_id]
    );

    res.json({
      success: true,
      token: authToken,
      user: { id: user.id, email: user.email, name: user.name },
      circle: circleResult.rows[0],
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Get invitation info (for accept page)
router.get('/invitations/:token', invitationRateLimiter, async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(
      `SELECT i.email, i.role, i.expires_at, cc.name as circle_name,
              u.name as invited_by_name
       FROM invitations i
       JOIN care_circles cc ON i.circle_id = cc.id
       JOIN users u ON i.invited_by = u.id
       WHERE i.token_hash = $1 AND i.status = 'pending'`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = result.rows[0];

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [invitation.email]
    );

    res.json({
      email: invitation.email,
      role: invitation.role,
      circleName: invitation.circle_name,
      invitedByName: invitation.invited_by_name,
      userExists: existingUser.rows.length > 0,
    });
  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({ error: 'Failed to get invitation' });
  }
});

// ============================================================================
// Member Management Routes
// ============================================================================

// Remove member
router.delete('/circles/:circleId/members/:memberId', authMiddleware, requirePermission('canRemoveMembers'), async (req, res) => {
  try {
    const { circleId, memberId } = req.params;

    // Check if trying to remove owner
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND id = $2',
      [circleId, memberId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (memberResult.rows[0].role === 'owner') {
      return res.status(400).json({ error: 'Cannot remove owner' });
    }

    await db.query(
      'DELETE FROM circle_members WHERE circle_id = $1 AND id = $2',
      [circleId, memberId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Update member role
router.put('/circles/:circleId/members/:memberId', authMiddleware, requirePermission('canChangeRoles'), async (req, res) => {
  try {
    const { circleId, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['caregiver', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required' });
    }

    // Check if trying to change owner
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND id = $2',
      [circleId, memberId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (memberResult.rows[0].role === 'owner') {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    const result = await db.query(
      `UPDATE circle_members SET role = $1 WHERE circle_id = $2 AND id = $3
       RETURNING *`,
      [role, circleId, memberId]
    );

    res.json({ success: true, member: result.rows[0] });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// ============================================================================
// Vault/Sync Routes
// ============================================================================

// Helper: parse safe pagination params from query
function parsePagination(query, defaultLimit = 100) {
  const limit = Math.min(parseInt(query.limit) || defaultLimit, 500);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return { limit, offset };
}

// ============================================================================
// Consent Sync Routes (patient device → server)
// ============================================================================

// Sync patient consent preferences from device to server (owner only)
router.put('/circles/:circleId/consent', authMiddleware, requirePermission('canEditCircle'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { consent } = req.body;

    if (!consent || typeof consent !== 'object') {
      return res.status(400).json({ error: 'consent object is required' });
    }

    // Only the owner (patient) may update consent
    if (req.member.role !== 'owner') {
      return res.status(403).json({ error: 'Only the circle owner can update consent settings' });
    }

    await db.query(
      'UPDATE care_circles SET patient_consent = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(consent), circleId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update consent error:', error);
    res.status(500).json({ error: 'Failed to update consent' });
  }
});

// Get stored consent preferences (owner only)
router.get('/circles/:circleId/consent', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;

    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );
    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }
    if (memberResult.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only the circle owner can view consent settings' });
    }

    const result = await db.query(
      'SELECT patient_consent FROM care_circles WHERE id = $1',
      [circleId]
    );

    res.json({ consent: result.rows[0]?.patient_consent || {} });
  } catch (error) {
    console.error('Get consent error:', error);
    res.status(500).json({ error: 'Failed to get consent' });
  }
});

// Get sync data for a circle — supports optional ?limit=&offset= for large vaults
router.get('/circles/:circleId/sync', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { limit, offset } = parsePagination(req.query);
    const paginated = req.query.limit !== undefined;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const role = memberResult.rows[0].role;
    const permissions = ROLE_PERMISSIONS[role];

    // Load patient consent prefs — used to gate each data category below
    const circleResult = await db.query(
      'SELECT patient_consent FROM care_circles WHERE id = $1',
      [circleId]
    );
    const consentData = circleResult.rows[0]?.patient_consent || {};

    const paginationSuffix = paginated ? ` LIMIT ${limit} OFFSET ${offset}` : '';

    // Incremental pull: when the client passes ?since=<ISO>, return only rows
    // changed after that timestamp. Previously `since` was ignored and every
    // pull re-downloaded the full snapshot.
    const sinceIso = (() => {
      const s = req.query.since;
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })();

    // Get vault data based on permissions AND patient consent
    const canSeeHealth    = permissions.canViewMedications && checkConsent(consentData, role, 'health_data');
    const canSeeDoctors   = permissions.canViewDoctors     && checkConsent(consentData, role, 'health_data');
    const canSeeAppts     = permissions.canViewAppointments && checkConsent(consentData, role, 'health_data');
    const canSeeContacts  = permissions.canViewContacts    && checkConsent(consentData, role, 'contact_info');
    const canSeeAccounts  = permissions.canViewAccounts    && checkConsent(consentData, role, 'financial_data');

    // table names are fixed literals (not user input); `since` is parameterized.
    const vaultQuery = (table, allowed) => {
      if (!allowed) return Promise.resolve({ rows: [] });
      const params = [circleId];
      let sinceClause = '';
      if (sinceIso) { params.push(sinceIso); sinceClause = ` AND updated_at > $${params.length}`; }
      return db.query(`SELECT * FROM ${table} WHERE circle_id = $1${sinceClause}${paginationSuffix}`, params);
    };

    const notesQuery = () => {
      const params = [circleId];
      let authorClause = '';
      if (!permissions.canViewAllNotes) { params.push(req.user.id); authorClause = ` AND author_id = $${params.length}`; }
      let sinceClause = '';
      if (sinceIso) { params.push(sinceIso); sinceClause = ` AND updated_at > $${params.length}`; }
      return db.query(
        `SELECT * FROM vault_notes WHERE circle_id = $1${authorClause}${sinceClause} ORDER BY created_at DESC${paginationSuffix}`,
        params,
      );
    };

    const [medications, doctors, appointments, contacts, notes, accounts] = await Promise.all([
      vaultQuery('vault_medications', canSeeHealth),
      vaultQuery('vault_doctors', canSeeDoctors),
      vaultQuery('vault_appointments', canSeeAppts),
      vaultQuery('vault_contacts', canSeeContacts),
      notesQuery(),
      vaultQuery('vault_accounts', canSeeAccounts),
    ]);

    res.json({
      medications: medications.rows,
      doctors: doctors.rows,
      appointments: appointments.rows,
      contacts: contacts.rows,
      notes: notes.rows,
      accounts: accounts.rows.map(decryptAccount),
      ...(paginated && { pagination: { limit, offset } }),
    });
  } catch (error) {
    console.error('Get sync data error:', error);
    res.status(500).json({ error: 'Failed to get sync data' });
  }
});

// ============================================================================
// Paginated vault list endpoints (per-category, for portal/server-side use)
// ============================================================================

function vaultListRoute(table, permissionKey, transform) {
  return async (req, res) => {
    try {
      const { circleId } = req.params;
      const { limit, offset } = parsePagination(req.query, 50);

      const memberResult = await db.query(
        'SELECT cm.role, u.name as accessor_name FROM circle_members cm JOIN users u ON cm.user_id = u.id WHERE cm.circle_id = $1 AND cm.user_id = $2',
        [circleId, req.user.id]
      );
      if (memberResult.rows.length === 0) return res.status(403).json({ error: 'Not a member' });

      const { role, accessor_name } = memberResult.rows[0];
      const permissions = ROLE_PERMISSIONS[role];
      if (!permissions[permissionKey]) return res.status(403).json({ error: 'Permission denied' });

      const countResult = await db.query(`SELECT COUNT(*) FROM ${table} WHERE circle_id = $1`, [circleId]);
      const total = parseInt(countResult.rows[0].count);

      const result = await db.query(
        `SELECT * FROM ${table} WHERE circle_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [circleId, limit, offset]
      );

      // Log caregiver data access so the patient can see who viewed their data
      if (role !== 'owner') {
        db.query(
          `INSERT INTO audit_logs (user_id, circle_id, action, category, description, metadata, ip_address, user_agent)
           VALUES ($1, $2, $3, 'vault', $4, $5, $6, $7)`,
          [
            req.user.id, circleId,
            'caregiver_data_viewed',
            `${accessor_name} (${role}) viewed ${table.replace('vault_', '')}`,
            JSON.stringify({ table, role, accessorName: accessor_name, count: total }),
            req.ip, req.headers['user-agent'],
          ]
        ).catch(err => console.error('[Audit] Failed to log caregiver access:', err));
      }

      const rows = transform ? result.rows.map(transform) : result.rows;
      res.json({ data: rows, pagination: { total, limit, offset, pages: Math.ceil(total / limit) } });
    } catch (error) {
      console.error(`List ${table} error:`, error);
      res.status(500).json({ error: 'Failed to list items' });
    }
  };
}

router.get('/circles/:circleId/vault/medications',   authMiddleware, requireConsent('health_data'),        vaultListRoute('vault_medications',  'canViewMedications', null));
router.get('/circles/:circleId/vault/doctors',        authMiddleware, requireConsent('health_data'),        vaultListRoute('vault_doctors',       'canViewDoctors',    null));
router.get('/circles/:circleId/vault/appointments',   authMiddleware, requireConsent('health_data'),        vaultListRoute('vault_appointments',  'canViewAppointments', null));
router.get('/circles/:circleId/vault/contacts',       authMiddleware, requireConsent('contact_info'),       vaultListRoute('vault_contacts',      'canViewContacts',   null));
router.get('/circles/:circleId/vault/accounts',       authMiddleware, requireConsent('financial_data'),     vaultListRoute('vault_accounts',      'canViewAccounts',   decryptAccount));
router.get('/circles/:circleId/vault/documents',      authMiddleware, requireConsent('personal_documents'), vaultListRoute('vault_documents',     'canViewDocuments',  stripDocumentFileData));

// Sync changes from device (bidirectional sync)
router.post('/circles/:circleId/sync', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { changes } = req.body;

    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'Changes must be an array' });
    }

    // Check membership and get permissions
    const memberResult = await db.query(
      `SELECT cm.role, u.name
       FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1 AND cm.user_id = $2`,
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const { role, name: userName } = memberResult.rows[0];
    const permissions = ROLE_PERMISSIONS[role];
    const conflicts = [];
    const applied = [];

    // Entity type to table mapping
    const tableMap = {
      medication: 'vault_medications',
      doctor: 'vault_doctors',
      appointment: 'vault_appointments',
      contact: 'vault_contacts',
      account: 'vault_accounts',
      document: 'vault_documents'
    };

    // Entity type to permission mapping
    const permissionMap = {
      medication: 'canEditMedications',
      doctor: 'canEditDoctors',
      appointment: 'canEditAppointments',
      contact: 'canEditContacts',
      account: 'canEditAccounts',
      document: 'canEditDocuments'
    };

    // Allowed columns per entity type (whitelist to prevent SQL injection)
    const allowedColumns = {
      medication: ['name', 'dosage', 'frequency', 'timing', 'instructions', 'prescribing_doctor', 'pharmacy', 'refill_date', 'is_active'],
      doctor: ['name', 'specialty', 'hospital', 'phone', 'email', 'address', 'notes', 'is_primary'],
      appointment: ['doctor_id', 'doctor_name', 'date', 'time', 'location', 'purpose', 'preparation_notes', 'status', 'reminder_sent'],
      contact: ['name', 'relationship', 'phone', 'phone_alt', 'email', 'address', 'is_emergency', 'priority', 'notes'],
      account: ['name', 'type', 'institution', 'account_number_encrypted', 'ifsc_code', 'branch', 'nominee', 'notes'],
      document: ['title', 'type', 'description', 'file_name', 'file_type', 'file_size', 'file_data_encrypted', 'expiry_date', 'is_sensitive']
    };

    for (const change of changes) {
      const { entityType, entityId, action, data } = change;

      // Validate entity type
      const tableName = tableMap[entityType];
      if (!tableName) {
        conflicts.push({ ...change, reason: 'invalid_entity_type' });
        continue;
      }

      // Check permission
      const requiredPermission = permissionMap[entityType];
      if (!permissions[requiredPermission]) {
        conflicts.push({ ...change, reason: 'permission_denied' });
        continue;
      }

      try {
        // Build safeData: only whitelisted columns, values from user input.
        // Column names in SQL come from the whitelist constant (not user input) — defence-in-depth.
        let safeData = null;
        if ((action === 'create' || action === 'update') && data && typeof data === 'object') {
          const validColumns = allowedColumns[entityType];
          const invalidColumns = Object.keys(data).filter(col => !validColumns.includes(col));
          if (invalidColumns.length > 0) {
            conflicts.push({ ...change, reason: 'invalid_fields', fields: invalidColumns });
            continue;
          }
          safeData = Object.fromEntries(
            validColumns
              .filter(col => Object.prototype.hasOwnProperty.call(data, col))
              .map(col => [col, data[col]])
          );
          if (Object.keys(safeData).length === 0) {
            conflicts.push({ ...change, reason: 'no_valid_fields' });
            continue;
          }
        }

        if (action === 'create') {
          const columns = Object.keys(safeData);
          const values = Object.values(safeData);

          // Reuse the device's entityId as the row id when it's a valid UUID, so
          // local and server ids stay consistent and later update/delete from the
          // device match this row (H1). ON CONFLICT keeps retried pushes idempotent
          // (a re-sent create after a lost response won't duplicate). Falls back to
          // the table's default id for legacy non-UUID client ids.
          const isUuid = typeof entityId === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId);

          const headCols = isUuid ? ['id', 'circle_id', 'created_by'] : ['circle_id', 'created_by'];
          const headVals = isUuid ? [entityId, circleId, userName] : [circleId, userName];
          const allVals = [...headVals, ...values];
          const placeholders = allVals.map((_, i) => `$${i + 1}`).join(', ');

          const result = await db.query(
            `INSERT INTO ${tableName} (${[...headCols, ...columns].join(', ')})
             VALUES (${placeholders})
             ${isUuid ? 'ON CONFLICT (id) DO NOTHING' : ''}
             RETURNING id`,
            allVals
          );

          applied.push({ ...change, serverId: result.rows[0]?.id ?? entityId });

        } else if (action === 'update') {
          const existing = await db.query(
            `SELECT id FROM ${tableName} WHERE id = $1 AND circle_id = $2`,
            [entityId, circleId]
          );

          if (existing.rows.length === 0) {
            conflicts.push({ ...change, reason: 'not_found' });
            continue;
          }

          const columns = Object.keys(safeData);
          const values = Object.values(safeData);
          const setClauses = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

          await db.query(
            `UPDATE ${tableName}
             SET ${setClauses}, updated_by = $${columns.length + 1}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $${columns.length + 2} AND circle_id = $${columns.length + 3}`,
            [...values, userName, entityId, circleId]
          );

          applied.push(change);

        } else if (action === 'delete') {
          const result = await db.query(
            `DELETE FROM ${tableName} WHERE id = $1 AND circle_id = $2 RETURNING id`,
            [entityId, circleId]
          );

          if (result.rows.length === 0) {
            conflicts.push({ ...change, reason: 'not_found' });
          } else {
            applied.push(change);
          }
        } else {
          conflicts.push({ ...change, reason: 'invalid_action' });
        }
      } catch (err) {
        console.error(`Sync error for ${entityType}:`, err);
        conflicts.push({ ...change, reason: 'database_error', message: err.message });
      }
    }

    // Push a realtime nudge to other circle members so portals/devices refresh
    // without waiting for the 30s polling fallback. Only broadcast when something
    // actually changed; failed conflicts on their own aren't worth a notification.
    if (applied.length > 0) {
      broadcastToCircle(circleId, {
        type: 'sync_update',
        applied: applied.length,
        conflicts: conflicts.length,
        entityTypes: [...new Set(applied.map(a => a.entityType).filter(Boolean))],
      });
    }

    res.json({
      success: true,
      applied,
      conflicts
    });
  } catch (error) {
    console.error('Sync changes error:', error);
    res.status(500).json({ error: 'Failed to sync changes' });
  }
});

// ============================================================================
// Vault PIN Recovery — caregiver-assisted escrow (H3 Phase 2/3)
// ============================================================================
// Extracted to ./routes/recovery.js (at-rest crypto helpers + routes moved
// verbatim). Mounted here so Express route registration order is unchanged.

require('./routes/recovery')(router, { db, authMiddleware, requirePermission, broadcastToCircle });

// ============================================================================
// Vault CRUD Routes
// ============================================================================
// Extracted to ./routes/vaultCrud.js (requireVaultCapacity middleware factory
// + medications/doctors/contacts/appointments/accounts/documents CRUD).

require('./routes/vaultCrud')(router, {
  db,
  authMiddleware,
  requirePermission,
  checkVaultLimit,
  encryptField,
  decryptField,
  decryptAccount,
  stripDocumentFileData,
  ROLE_PERMISSIONS,
});

// ============================================================================
// Notes Routes
// ============================================================================
// Extracted to ./routes/notes.js.

require('./routes/notes')(router, { db, authMiddleware, ROLE_PERMISSIONS });

// ============================================================================
// Health / Adherence / Activity / Alerts / Check-in Routes
// ============================================================================
// Extracted to ./routes/monitoring.js (Health Data, Medication Adherence,
// Activity Monitoring, Caregiver Alerts, Check-in Logs sections).
// VITAL_THRESHOLDS, checkVitalThreshold and fireVitalAlertIfAbnormal moved
// there as well — only the health sync route uses them.

require('./routes/monitoring')(router, { db, authMiddleware, requireConsent, broadcastToCircle });

// ============================================================================
// Dashboard Summary Route
// ============================================================================
// Extracted to ./routes/dashboard.js (incl. the camelizeRow helper).

require('./routes/dashboard')(router, { db, authMiddleware });

// ============================================================================
// WebSocket Support
// ============================================================================

const wsClients = new Map(); // circleId -> Set of WebSocket connections

// Deliver an event to WebSocket clients connected to THIS instance.
// circleId '*' fans out to every connected circle (system-wide notifications).
function deliverToLocalCircle(circleId, event) {
  const targets = circleId === '*' ? [...wsClients.values()] : [wsClients.get(circleId)];
  const message = JSON.stringify(event);
  for (const clients of targets) {
    if (!clients) continue;
    clients.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    });
  }
}

// Broadcast to the whole circle: local clients always; other instances via
// Redis pub/sub when configured (REDIS_URL). See server/realtime.js.
function broadcastToCircle(circleId, event) {
  deliverToLocalCircle(circleId, event);
  realtime.publishCircleEvent(circleId, event);
}

// Short-lived single-use tickets for WebSocket auth. Clients that cannot set
// cookies or headers on the WS upgrade (mobile / React Native) POST to
// /ws-ticket with a valid Bearer token and receive a ticket they can put in
// the WS URL. The ticket is consumed on first use and expires in 30 seconds,
// so even if the URL is captured in HTTP access logs it cannot be replayed.
const WS_TICKET_TTL_MS = 30 * 1000;
const wsTickets = new Map();

async function issueWsTicket(userId) {
  const ticket = crypto.randomBytes(32).toString('hex');
  // Shared store first (multi-instance); in-memory fallback otherwise.
  const shared = await realtime.storeTicket(ticket, userId, WS_TICKET_TTL_MS);
  if (!shared) {
    wsTickets.set(ticket, { userId, expiresAt: Date.now() + WS_TICKET_TTL_MS });
  }
  return ticket;
}

async function consumeWsTicket(ticket) {
  if (!ticket) return null;
  // undefined = Redis unavailable → fall through to the in-memory store.
  const sharedUserId = await realtime.consumeTicket(ticket);
  if (sharedUserId !== undefined) return sharedUserId;
  const entry = wsTickets.get(ticket);
  if (!entry) return null;
  wsTickets.delete(ticket);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

// Opportunistic cleanup so an attacker spamming /ws-ticket can't grow memory.
setInterval(() => {
  const now = Date.now();
  for (const [t, e] of wsTickets.entries()) {
    if (e.expiresAt < now) wsTickets.delete(t);
  }
}, 60 * 1000).unref();

// WebSocket connection handler
async function handleWebSocket(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const circleId = url.searchParams.get('circleId');

  // Prefer a single-use ticket (mobile clients). Fall back to cookie /
  // Authorization header for browser/portal clients on the same origin.
  let userId = await consumeWsTicket(url.searchParams.get('ticket'));

  if (!userId) {
    let token = getCookie(req, AUTH_COOKIE_NAME);
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    if (!token || !circleId) {
      ws.close(4001, 'Missing authentication or circleId');
      return;
    }
    const decoded = verifyJWT(token);
    if (!decoded) {
      ws.close(4002, 'Invalid token');
      return;
    }
    userId = decoded.id;
  }

  if (!circleId) {
    ws.close(4001, 'Missing circleId');
    return;
  }

  const decoded = { id: userId };

  // Verify membership
  try {
    const memberResult = await db.query(
      'SELECT id FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, decoded.id]
    );

    if (memberResult.rows.length === 0) {
      ws.close(4003, 'Not authorized for this circle');
      return;
    }
  } catch (error) {
    ws.close(4004, 'Database error');
    return;
  }

  // Add to clients
  if (!wsClients.has(circleId)) {
    wsClients.set(circleId, new Set());
  }
  wsClients.get(circleId).add(ws);

  // Send connected event
  ws.send(JSON.stringify({
    type: 'connected',
    circleId,
    timestamp: Date.now(),
  }));

  ws.on('close', () => {
    const clients = wsClients.get(circleId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        wsClients.delete(circleId);
      }
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error) {
      console.warn('[WebSocket] Invalid message received:', { error: error.message });
    }
  });
}

// Issue a short-lived single-use ticket for the WebSocket. Mobile clients
// call this with their Bearer token, then put the ticket in the WS URL.
router.post('/ws-ticket', authMiddleware, async (req, res) => {
  const ticket = await issueWsTicket(req.user.id);
  res.json({ ticket, expiresIn: WS_TICKET_TTL_MS / 1000 });
});

// ============================================================================
// System Notifications Route (for mobile app)
// ============================================================================

// Get pending system notifications for the user
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM notification_queue
       WHERE status = 'pending'
       AND (recipient_type = 'all'
            OR (recipient_type = 'user' AND recipient_id = $1))
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    // Get circle-specific notifications
    const circleNotifications = await db.query(
      `SELECT nq.* FROM notification_queue nq
       JOIN circle_members cm ON nq.recipient_id = cm.circle_id
       WHERE nq.status = 'pending'
       AND nq.recipient_type = 'circle'
       AND cm.user_id = $1
       ORDER BY nq.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    const allNotifications = [...result.rows, ...circleNotifications.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20);

    res.json({ notifications: allNotifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.json({ notifications: [] });
  }
});

// Mark notification as read
router.post('/notifications/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;

    await db.query(
      `UPDATE notification_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [notificationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ============================================================================
// Feature Flag Evaluation (for mobile app / caregiver portal)
// ============================================================================

// Deterministic 0-99 bucket for rollout percentage
function userRolloutBucket(userId) {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 100;
}

router.post('/flags/evaluate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { circleId } = req.body;

    const result = await db.query('SELECT * FROM feature_flags WHERE is_enabled = true ORDER BY name');
    const evaluation = {};
    for (const flag of result.rows) {
      if (flag.enabled_for_all) {
        evaluation[flag.name] = true;
        continue;
      }
      const userIds = Array.isArray(flag.enabled_user_ids) ? flag.enabled_user_ids : [];
      const circleIds = Array.isArray(flag.enabled_circle_ids) ? flag.enabled_circle_ids : [];
      if (userIds.includes(userId) || (circleId && circleIds.includes(circleId))) {
        evaluation[flag.name] = true;
        continue;
      }
      if (flag.rollout_percentage > 0) {
        evaluation[flag.name] = userRolloutBucket(userId) < flag.rollout_percentage;
      } else {
        evaluation[flag.name] = false;
      }
    }

    res.json({ flags: evaluation });
  } catch (error) {
    console.error('Feature flag evaluation error:', error);
    res.status(500).json({ error: 'Failed to evaluate feature flags' });
  }
});

// ============================================================================
// Data Archival
// ============================================================================

const ARCHIVAL_RETENTION = {
  health_data:      parseInt(process.env.ARCHIVE_HEALTH_DAYS      || '365'),
  medication_doses: parseInt(process.env.ARCHIVE_DOSE_DAYS        || '365'),
  activity_logs:    parseInt(process.env.ARCHIVE_ACTIVITY_DAYS    || '90'),
  checkin_logs:     parseInt(process.env.ARCHIVE_CHECKIN_DAYS     || '90'),
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function runArchival() {
  try {
    const result = await db.query(
      'SELECT * FROM archive_old_data($1, $2, $3, $4)',
      [
        ARCHIVAL_RETENTION.health_data,
        ARCHIVAL_RETENTION.medication_doses,
        ARCHIVAL_RETENTION.activity_logs,
        ARCHIVAL_RETENTION.checkin_logs,
      ]
    );
    const summary = result.rows.map((r) => `${r.table_name}: ${r.rows_archived}`).join(', ');
    console.log(`[Archival] Completed — ${summary}`);
    return result.rows;
  } catch (error) {
    console.error('[Archival] Error running archive_old_data:', error.message);
    throw error;
  }
}

// Run archival once at startup (after a short delay) and then every 24 hours.
// With Redis configured, an advisory lock ensures only one instance runs it
// per cycle; without Redis the lock is a pass-through (single instance).
const ARCHIVAL_INTERVAL_MS = MS_PER_DAY;
const ARCHIVAL_LOCK_TTL_MS = 6 * 60 * 60 * 1000; // well under the 24h cycle
async function runArchivalIfLeader() {
  if (await realtime.acquireJobLock('archival', ARCHIVAL_LOCK_TTL_MS)) {
    await runArchival();
  }
}
setTimeout(() => {
  runArchivalIfLeader().catch(() => {});
  setInterval(() => runArchivalIfLeader().catch(() => {}), ARCHIVAL_INTERVAL_MS);
}, 30 * 1000);

// Push delivery for admin notifications (notification_queue). See
// server/notificationWorker.js — WS push + email for high/urgent, retries,
// multi-instance safe via the realtime advisory lock.
const { startNotificationWorker } = require('./notificationWorker');
startNotificationWorker({
  db,
  broadcast: broadcastToCircle,
  realtime,
  resend,
  fromEmail: FROM_EMAIL,
});

// Admin endpoint to trigger manual archival (used by ops/cron jobs)
router.post('/admin/archive', authMiddleware, async (req, res) => {
  try {
    // Only circle owners can trigger archival
    const memberResult = await db.query(
      `SELECT cm.role FROM circle_members cm WHERE cm.user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (memberResult.rows.length === 0 || memberResult.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const rows = await runArchival();
    res.json({ success: true, archived: rows });
  } catch (error) {
    res.status(500).json({ error: 'Archival failed' });
  }
});

// Export
module.exports = {
  router,
  handleWebSocket,
  broadcastToCircle,
};

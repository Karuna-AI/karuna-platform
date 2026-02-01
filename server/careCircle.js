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
const db = require('./db');
const router = express.Router();

const BCRYPT_ROUNDS = 12;

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
    canDeleteCircle: true,
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
    canDeleteCircle: false,
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
    canDeleteCircle: false,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  // Support both bcrypt and legacy SHA-256 hashes for migration
  if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
    // bcrypt hash
    return bcrypt.compare(password, hash);
  } else {
    // Legacy SHA-256 hash - for backward compatibility during migration
    const legacyHash = crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
    return hash === legacyHash;
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
// Authentication Middleware
// ============================================================================

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyJWT(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
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
// Auth Routes
// ============================================================================

// Register caregiver
router.post('/auth/register', registrationRateLimiter, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name`,
      [email.toLowerCase(), passwordHash, name, phone]
    );

    const user = result.rows[0];
    const token = createJWT(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
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
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const passwordValid = await verifyPassword(password, user.password_hash);
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

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name },
      circles: circlesResult.rows,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name FROM users WHERE id = $1',
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
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
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
router.put('/circles/:circleId', authMiddleware, requirePermission('canDeleteCircle'), async (req, res) => {
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
      `INSERT INTO invitations (circle_id, invited_by, email, name, role, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [circleId, req.user.id, email.toLowerCase(), email.split('@')[0], role, token, expiresAt]
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
       WHERE i.token = $1 AND i.status = 'pending'`,
      [token]
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
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
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
router.get('/invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(
      `SELECT i.email, i.role, i.expires_at, cc.name as circle_name,
              u.name as invited_by_name
       FROM invitations i
       JOIN care_circles cc ON i.circle_id = cc.id
       JOIN users u ON i.invited_by = u.id
       WHERE i.token = $1 AND i.status = 'pending'`,
      [token]
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

// Get sync data for a circle
router.get('/circles/:circleId/sync', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;

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

    // Get all vault data based on permissions
    const [medications, doctors, appointments, contacts, notes, accounts] = await Promise.all([
      permissions.canViewMedications ? db.query('SELECT * FROM vault_medications WHERE circle_id = $1', [circleId]) : { rows: [] },
      permissions.canViewDoctors ? db.query('SELECT * FROM vault_doctors WHERE circle_id = $1', [circleId]) : { rows: [] },
      permissions.canViewAppointments ? db.query('SELECT * FROM vault_appointments WHERE circle_id = $1', [circleId]) : { rows: [] },
      permissions.canViewContacts ? db.query('SELECT * FROM vault_contacts WHERE circle_id = $1', [circleId]) : { rows: [] },
      permissions.canViewAllNotes
        ? db.query('SELECT * FROM vault_notes WHERE circle_id = $1 ORDER BY created_at DESC', [circleId])
        : db.query('SELECT * FROM vault_notes WHERE circle_id = $1 AND author_id = $2 ORDER BY created_at DESC', [circleId, req.user.id]),
      permissions.canViewAccounts ? db.query('SELECT * FROM vault_accounts WHERE circle_id = $1', [circleId]) : { rows: [] },
    ]);

    res.json({
      medications: medications.rows,
      doctors: doctors.rows,
      appointments: appointments.rows,
      contacts: contacts.rows,
      notes: notes.rows,
      accounts: accounts.rows,
    });
  } catch (error) {
    console.error('Get sync data error:', error);
    res.status(500).json({ error: 'Failed to get sync data' });
  }
});

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
        if (action === 'create') {
          const columns = Object.keys(data);
          const values = Object.values(data);
          const placeholders = columns.map((_, i) => `$${i + 3}`).join(', ');

          const result = await db.query(
            `INSERT INTO ${tableName} (circle_id, created_by, ${columns.join(', ')})
             VALUES ($1, $2, ${placeholders})
             RETURNING *`,
            [circleId, userName, ...values]
          );

          applied.push({ ...change, serverId: result.rows[0].id });

        } else if (action === 'update') {
          const existing = await db.query(
            `SELECT id FROM ${tableName} WHERE id = $1 AND circle_id = $2`,
            [entityId, circleId]
          );

          if (existing.rows.length === 0) {
            conflicts.push({ ...change, reason: 'not_found' });
            continue;
          }

          const columns = Object.keys(data);
          const values = Object.values(data);
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
// Vault CRUD Routes
// ============================================================================

// --- Medications ---

// Create medication
router.post('/circles/:circleId/vault/medications', authMiddleware, requirePermission('canEditMedications'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Medication name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_medications
       (circle_id, name, dosage, frequency, timing, instructions, prescribing_doctor, pharmacy, refill_date, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [circleId, name, dosage, frequency, timing || [], instructions, prescribingDoctor, pharmacy, refillDate, isActive !== false, req.member.name]
    );

    res.json({ success: true, medication: result.rows[0] });
  } catch (error) {
    console.error('Create medication error:', error);
    res.status(500).json({ error: 'Failed to create medication' });
  }
});

// Update medication
router.put('/circles/:circleId/vault/medications/:medicationId', authMiddleware, requirePermission('canEditMedications'), async (req, res) => {
  try {
    const { circleId, medicationId } = req.params;
    const { name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_medications WHERE id = $1 AND circle_id = $2',
      [medicationId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const result = await db.query(
      `UPDATE vault_medications
       SET name = COALESCE($1, name), dosage = COALESCE($2, dosage),
           frequency = COALESCE($3, frequency), timing = COALESCE($4, timing),
           instructions = COALESCE($5, instructions), prescribing_doctor = COALESCE($6, prescribing_doctor),
           pharmacy = COALESCE($7, pharmacy), refill_date = COALESCE($8, refill_date),
           is_active = COALESCE($9, is_active), updated_by = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND circle_id = $12
       RETURNING *`,
      [name, dosage, frequency, timing, instructions, prescribingDoctor, pharmacy, refillDate, isActive, req.member.name, medicationId, circleId]
    );

    res.json({ success: true, medication: result.rows[0] });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Failed to update medication' });
  }
});

// Delete medication
router.delete('/circles/:circleId/vault/medications/:medicationId', authMiddleware, requirePermission('canEditMedications'), async (req, res) => {
  try {
    const { circleId, medicationId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_medications WHERE id = $1 AND circle_id = $2 RETURNING id',
      [medicationId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({ error: 'Failed to delete medication' });
  }
});

// --- Doctors ---

// Create doctor
router.post('/circles/:circleId/vault/doctors', authMiddleware, requirePermission('canEditDoctors'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, specialty, hospital, phone, email, address, notes, isPrimary } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Doctor name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_doctors
       (circle_id, name, specialty, hospital, phone, email, address, notes, is_primary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [circleId, name, specialty, hospital, phone, email, address, notes, isPrimary || false, req.member.name]
    );

    res.json({ success: true, doctor: result.rows[0] });
  } catch (error) {
    console.error('Create doctor error:', error);
    res.status(500).json({ error: 'Failed to create doctor' });
  }
});

// Update doctor
router.put('/circles/:circleId/vault/doctors/:doctorId', authMiddleware, requirePermission('canEditDoctors'), async (req, res) => {
  try {
    const { circleId, doctorId } = req.params;
    const { name, specialty, hospital, phone, email, address, notes, isPrimary } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_doctors WHERE id = $1 AND circle_id = $2',
      [doctorId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const result = await db.query(
      `UPDATE vault_doctors
       SET name = COALESCE($1, name), specialty = COALESCE($2, specialty),
           hospital = COALESCE($3, hospital), phone = COALESCE($4, phone),
           email = COALESCE($5, email), address = COALESCE($6, address),
           notes = COALESCE($7, notes), is_primary = COALESCE($8, is_primary),
           updated_by = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND circle_id = $11
       RETURNING *`,
      [name, specialty, hospital, phone, email, address, notes, isPrimary, req.member.name, doctorId, circleId]
    );

    res.json({ success: true, doctor: result.rows[0] });
  } catch (error) {
    console.error('Update doctor error:', error);
    res.status(500).json({ error: 'Failed to update doctor' });
  }
});

// Delete doctor
router.delete('/circles/:circleId/vault/doctors/:doctorId', authMiddleware, requirePermission('canEditDoctors'), async (req, res) => {
  try {
    const { circleId, doctorId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_doctors WHERE id = $1 AND circle_id = $2 RETURNING id',
      [doctorId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({ error: 'Failed to delete doctor' });
  }
});

// --- Contacts ---

// Create contact
router.post('/circles/:circleId/vault/contacts', authMiddleware, requirePermission('canEditContacts'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, relationship, phone, email, address, isEmergency, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_contacts
       (circle_id, name, relationship, phone, email, address, is_emergency, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [circleId, name, relationship, phone, email, address, isEmergency || false, notes, req.member.name]
    );

    res.json({ success: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/circles/:circleId/vault/contacts/:contactId', authMiddleware, requirePermission('canEditContacts'), async (req, res) => {
  try {
    const { circleId, contactId } = req.params;
    const { name, relationship, phone, email, address, isEmergency, notes } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_contacts WHERE id = $1 AND circle_id = $2',
      [contactId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await db.query(
      `UPDATE vault_contacts
       SET name = COALESCE($1, name), relationship = COALESCE($2, relationship),
           phone = COALESCE($3, phone), email = COALESCE($4, email),
           address = COALESCE($5, address), is_emergency = COALESCE($6, is_emergency),
           notes = COALESCE($7, notes), updated_by = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND circle_id = $10
       RETURNING *`,
      [name, relationship, phone, email, address, isEmergency, notes, req.member.name, contactId, circleId]
    );

    res.json({ success: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/circles/:circleId/vault/contacts/:contactId', authMiddleware, requirePermission('canEditContacts'), async (req, res) => {
  try {
    const { circleId, contactId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_contacts WHERE id = $1 AND circle_id = $2 RETURNING id',
      [contactId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// --- Appointments ---

// Create appointment
router.post('/circles/:circleId/vault/appointments', authMiddleware, requirePermission('canEditAppointments'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { doctorId, doctorName, purpose, date, time, location, notes, reminder, status } = req.body;

    if (!purpose || !date) {
      return res.status(400).json({ error: 'Purpose and date are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_appointments
       (circle_id, doctor_id, doctor_name, purpose, date, time, location, preparation_notes, reminder_sent, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [circleId, doctorId, doctorName, purpose, date, time, location, notes, reminder || false, status || 'scheduled', req.member.name]
    );

    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/circles/:circleId/vault/appointments/:appointmentId', authMiddleware, requirePermission('canEditAppointments'), async (req, res) => {
  try {
    const { circleId, appointmentId } = req.params;
    const { doctorId, doctorName, purpose, date, time, location, notes, reminder, status } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_appointments WHERE id = $1 AND circle_id = $2',
      [appointmentId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const result = await db.query(
      `UPDATE vault_appointments
       SET doctor_id = COALESCE($1, doctor_id), doctor_name = COALESCE($2, doctor_name),
           purpose = COALESCE($3, purpose), date = COALESCE($4, date),
           time = COALESCE($5, time), location = COALESCE($6, location),
           preparation_notes = COALESCE($7, preparation_notes), reminder_sent = COALESCE($8, reminder_sent),
           status = COALESCE($9, status), updated_by = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND circle_id = $12
       RETURNING *`,
      [doctorId, doctorName, purpose, date, time, location, notes, reminder, status, req.member.name, appointmentId, circleId]
    );

    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment
router.delete('/circles/:circleId/vault/appointments/:appointmentId', authMiddleware, requirePermission('canEditAppointments'), async (req, res) => {
  try {
    const { circleId, appointmentId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_appointments WHERE id = $1 AND circle_id = $2 RETURNING id',
      [appointmentId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

// --- Accounts ---

// Create account
router.post('/circles/:circleId/vault/accounts', authMiddleware, requirePermission('canEditAccounts'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { name, type, institution, accountNumber, ifscCode, branch, nominee, notes } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_accounts
       (circle_id, name, type, institution, account_number_encrypted, ifsc_code, branch, nominee, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [circleId, name, type, institution, accountNumber, ifscCode, branch, nominee, notes, req.member.name]
    );

    res.json({ success: true, account: result.rows[0] });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account
router.put('/circles/:circleId/vault/accounts/:accountId', authMiddleware, requirePermission('canEditAccounts'), async (req, res) => {
  try {
    const { circleId, accountId } = req.params;
    const { name, type, institution, accountNumber, ifscCode, branch, nominee, notes } = req.body;

    const existing = await db.query(
      'SELECT id FROM vault_accounts WHERE id = $1 AND circle_id = $2',
      [accountId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const result = await db.query(
      `UPDATE vault_accounts
       SET name = COALESCE($1, name), type = COALESCE($2, type),
           institution = COALESCE($3, institution), account_number_encrypted = COALESCE($4, account_number_encrypted),
           ifsc_code = COALESCE($5, ifsc_code), branch = COALESCE($6, branch),
           nominee = COALESCE($7, nominee), notes = COALESCE($8, notes),
           updated_by = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND circle_id = $11
       RETURNING *`,
      [name, type, institution, accountNumber, ifscCode, branch, nominee, notes, req.member.name, accountId, circleId]
    );

    res.json({ success: true, account: result.rows[0] });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/circles/:circleId/vault/accounts/:accountId', authMiddleware, requirePermission('canEditAccounts'), async (req, res) => {
  try {
    const { circleId, accountId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_accounts WHERE id = $1 AND circle_id = $2 RETURNING id',
      [accountId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// --- Documents ---

// Create document
router.post('/circles/:circleId/vault/documents', authMiddleware, requirePermission('canEditDocuments'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { title, name, type, description, fileName, fileType, fileSize, expiryDate, isSensitive } = req.body;
    const docTitle = title || name;

    if (!docTitle) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    const result = await db.query(
      `INSERT INTO vault_documents
       (circle_id, title, type, description, file_name, file_type, file_size, expiry_date, is_sensitive, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [circleId, docTitle, type || 'other', description, fileName, fileType, fileSize, expiryDate, isSensitive || false, req.member.name]
    );

    res.json({ success: true, document: result.rows[0] });
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Update document
router.put('/circles/:circleId/vault/documents/:documentId', authMiddleware, requirePermission('canEditDocuments'), async (req, res) => {
  try {
    const { circleId, documentId } = req.params;
    const { title, name, type, description, fileName, fileType, fileSize, expiryDate, isSensitive } = req.body;
    const docTitle = title || name;

    const existing = await db.query(
      'SELECT id FROM vault_documents WHERE id = $1 AND circle_id = $2',
      [documentId, circleId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = await db.query(
      `UPDATE vault_documents
       SET title = COALESCE($1, title), type = COALESCE($2, type),
           description = COALESCE($3, description), file_name = COALESCE($4, file_name),
           file_type = COALESCE($5, file_type), file_size = COALESCE($6, file_size),
           expiry_date = COALESCE($7, expiry_date), is_sensitive = COALESCE($8, is_sensitive),
           updated_by = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND circle_id = $11
       RETURNING *`,
      [docTitle, type, description, fileName, fileType, fileSize, expiryDate, isSensitive, req.member.name, documentId, circleId]
    );

    res.json({ success: true, document: result.rows[0] });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/circles/:circleId/vault/documents/:documentId', authMiddleware, requirePermission('canEditDocuments'), async (req, res) => {
  try {
    const { circleId, documentId } = req.params;

    const result = await db.query(
      'DELETE FROM vault_documents WHERE id = $1 AND circle_id = $2 RETURNING id',
      [documentId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ============================================================================
// Notes Routes
// ============================================================================

// Add a note
router.post('/circles/:circleId/notes', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { title, content, category } = req.body;

    // Check membership
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

    const { role, name } = memberResult.rows[0];
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions.canAddNotes) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await db.query(
      `INSERT INTO vault_notes (circle_id, author_id, author_name, author_role, title, content, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [circleId, req.user.id, name, role, title, content, category || 'general']
    );

    res.json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Update a note
router.put('/circles/:circleId/notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { circleId, noteId } = req.params;
    const { title, content, category } = req.body;

    // Check if note exists and user can edit
    const noteResult = await db.query(
      'SELECT author_id FROM vault_notes WHERE id = $1 AND circle_id = $2',
      [noteId, circleId]
    );

    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or owner can edit
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const isAuthor = noteResult.rows[0].author_id === req.user.id;
    const isOwner = memberResult.rows[0].role === 'owner';

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Can only edit your own notes' });
    }

    const result = await db.query(
      `UPDATE vault_notes
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           category = COALESCE($3, category)
       WHERE id = $4
       RETURNING *`,
      [title, content, category, noteId]
    );

    res.json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete a note
router.delete('/circles/:circleId/notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { circleId, noteId } = req.params;

    // Check if note exists and user can delete
    const noteResult = await db.query(
      'SELECT author_id FROM vault_notes WHERE id = $1 AND circle_id = $2',
      [noteId, circleId]
    );

    if (noteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or owner can delete
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const isAuthor = noteResult.rows[0].author_id === req.user.id;
    const isOwner = memberResult.rows[0].role === 'owner';

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Can only delete your own notes' });
    }

    await db.query('DELETE FROM vault_notes WHERE id = $1', [noteId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============================================================================
// Health Data Routes (Caregiver Dashboard)
// ============================================================================

// Get health data for a circle
router.get('/circles/:circleId/health', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { type, days = 7 } = req.query;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    let query = `
      SELECT * FROM health_data
      WHERE circle_id = $1 AND measured_at >= $2
    `;
    const params = [circleId, sinceDate];

    if (type) {
      query += ' AND data_type = $3';
      params.push(type);
    }

    query += ' ORDER BY measured_at DESC LIMIT 500';

    const result = await db.query(query, params);

    // Group by type and calculate summaries
    const healthData = {};
    const latestByType = {};

    result.rows.forEach(row => {
      if (!healthData[row.data_type]) {
        healthData[row.data_type] = [];
      }
      healthData[row.data_type].push(row);

      if (!latestByType[row.data_type] || new Date(row.measured_at) > new Date(latestByType[row.data_type].measured_at)) {
        latestByType[row.data_type] = row;
      }
    });

    res.json({
      data: healthData,
      latest: latestByType,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get health data error:', error);
    res.status(500).json({ error: 'Failed to get health data' });
  }
});

// Sync health data from device
router.post('/circles/:circleId/health', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { readings } = req.body;

    if (!Array.isArray(readings)) {
      return res.status(400).json({ error: 'Readings must be an array' });
    }

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    let inserted = 0;
    for (const reading of readings) {
      await db.query(
        `INSERT INTO health_data (circle_id, data_type, value, unit, measured_at, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [circleId, reading.dataType, JSON.stringify(reading.value), reading.unit, reading.measuredAt, reading.source || 'device', reading.notes]
      );
      inserted++;
    }

    // Broadcast to caregivers
    broadcastToCircle(circleId, { type: 'health_update', count: inserted });

    res.json({ success: true, inserted });
  } catch (error) {
    console.error('Sync health data error:', error);
    res.status(500).json({ error: 'Failed to sync health data' });
  }
});

// ============================================================================
// Medication Adherence Routes
// ============================================================================

// Get medication adherence data
router.get('/circles/:circleId/adherence', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { days = 7 } = req.query;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Get medications
    const medicationsResult = await db.query(
      'SELECT * FROM vault_medications WHERE circle_id = $1 AND is_active = true',
      [circleId]
    );

    // Get dose records
    const dosesResult = await db.query(
      `SELECT md.*, vm.name as medication_name
       FROM medication_doses md
       JOIN vault_medications vm ON md.medication_id = vm.id
       WHERE md.circle_id = $1 AND md.scheduled_time >= $2
       ORDER BY md.scheduled_time DESC`,
      [circleId, sinceDate]
    );

    // Calculate adherence stats
    const totalDoses = dosesResult.rows.length;
    const takenDoses = dosesResult.rows.filter(d => d.status === 'taken').length;
    const missedDoses = dosesResult.rows.filter(d => d.status === 'missed').length;
    const skippedDoses = dosesResult.rows.filter(d => d.status === 'skipped').length;
    const pendingDoses = dosesResult.rows.filter(d => d.status === 'pending').length;

    const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / (totalDoses - pendingDoses)) * 100) : 100;

    // Group by medication
    const byMedication = {};
    dosesResult.rows.forEach(dose => {
      if (!byMedication[dose.medication_id]) {
        byMedication[dose.medication_id] = {
          medicationId: dose.medication_id,
          medicationName: dose.medication_name,
          doses: [],
          taken: 0,
          missed: 0,
          skipped: 0,
          pending: 0,
        };
      }
      byMedication[dose.medication_id].doses.push(dose);
      byMedication[dose.medication_id][dose.status]++;
    });

    // Get today's doses
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysDoses = dosesResult.rows.filter(d => {
      const scheduled = new Date(d.scheduled_time);
      return scheduled >= today && scheduled < tomorrow;
    });

    res.json({
      summary: {
        adherenceRate,
        totalDoses,
        takenDoses,
        missedDoses,
        skippedDoses,
        pendingDoses,
      },
      medications: medicationsResult.rows,
      byMedication: Object.values(byMedication),
      todaysDoses,
      recentDoses: dosesResult.rows.slice(0, 20),
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get adherence error:', error);
    res.status(500).json({ error: 'Failed to get adherence data' });
  }
});

// Sync medication doses from device
router.post('/circles/:circleId/adherence', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { doses } = req.body;

    if (!Array.isArray(doses)) {
      return res.status(400).json({ error: 'Doses must be an array' });
    }

    let synced = 0;
    for (const dose of doses) {
      await db.query(
        `INSERT INTO medication_doses (circle_id, medication_id, scheduled_time, status, taken_at, skipped_reason, notes, synced_from_device)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT DO NOTHING`,
        [circleId, dose.medicationId, dose.scheduledTime, dose.status, dose.takenAt, dose.skippedReason, dose.notes]
      );
      synced++;
    }

    // Check for missed medications and create alerts
    const missedCount = doses.filter(d => d.status === 'missed').length;
    if (missedCount > 0) {
      await db.query(
        `INSERT INTO caregiver_alerts (circle_id, alert_type, severity, title, message, data)
         VALUES ($1, 'missed_medication', $2, $3, $4, $5)`,
        [
          circleId,
          missedCount >= 3 ? 'high' : 'medium',
          `${missedCount} medication(s) missed`,
          `${missedCount} scheduled medication dose(s) were missed.`,
          JSON.stringify({ missedCount, doses: doses.filter(d => d.status === 'missed') })
        ]
      );

      broadcastToCircle(circleId, { type: 'alert', alertType: 'missed_medication', count: missedCount });
    }

    res.json({ success: true, synced });
  } catch (error) {
    console.error('Sync adherence error:', error);
    res.status(500).json({ error: 'Failed to sync adherence data' });
  }
});

// ============================================================================
// Activity Monitoring Routes
// ============================================================================

// Get activity logs
router.get('/circles/:circleId/activity', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { days = 7 } = req.query;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Get activity logs
    const result = await db.query(
      `SELECT * FROM activity_logs
       WHERE circle_id = $1 AND recorded_at >= $2
       ORDER BY recorded_at DESC
       LIMIT 500`,
      [circleId, sinceDate]
    );

    // Get last activity
    const lastActivityResult = await db.query(
      `SELECT * FROM activity_logs
       WHERE circle_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [circleId]
    );

    const lastActivity = lastActivityResult.rows[0] || null;
    const lastActiveAt = lastActivity ? lastActivity.recorded_at : null;

    // Calculate inactivity
    let inactivityMinutes = null;
    let inactivityStatus = 'unknown';
    if (lastActiveAt) {
      inactivityMinutes = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 60000);
      if (inactivityMinutes < 60) {
        inactivityStatus = 'active';
      } else if (inactivityMinutes < 240) {
        inactivityStatus = 'normal';
      } else if (inactivityMinutes < 480) {
        inactivityStatus = 'concerning';
      } else {
        inactivityStatus = 'alert';
      }
    }

    // Group activity by type
    const byType = {};
    result.rows.forEach(log => {
      if (!byType[log.activity_type]) {
        byType[log.activity_type] = [];
      }
      byType[log.activity_type].push(log);
    });

    // Get daily activity counts
    const dailyCounts = {};
    result.rows.forEach(log => {
      const date = new Date(log.recorded_at).toISOString().split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    res.json({
      lastActivity,
      lastActiveAt,
      inactivityMinutes,
      inactivityStatus,
      activityLogs: result.rows.slice(0, 50),
      byType,
      dailyCounts,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity data' });
  }
});

// Log activity from device
router.post('/circles/:circleId/activity', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { activities } = req.body;

    if (!Array.isArray(activities)) {
      return res.status(400).json({ error: 'Activities must be an array' });
    }

    let logged = 0;
    for (const activity of activities) {
      // Support both 'activityType' (camelCase from client) and 'type' (shorthand)
      const activityType = activity.activityType || activity.type;
      if (!activityType) {
        continue; // Skip activities without a type
      }
      await db.query(
        `INSERT INTO activity_logs (circle_id, activity_type, details, recorded_at, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [circleId, activityType, JSON.stringify(activity.details || {}), activity.recordedAt || new Date(), activity.source || 'device']
      );
      logged++;
    }

    // Broadcast activity update
    broadcastToCircle(circleId, { type: 'activity_update', count: logged });

    res.json({ success: true, logged });
  } catch (error) {
    console.error('Log activity error:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// ============================================================================
// Caregiver Alerts Routes
// ============================================================================

// Get alerts for a circle
router.get('/circles/:circleId/alerts', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { status = 'active', limit = 50 } = req.query;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    let query = `
      SELECT ca.*, u.name as acknowledged_by_name
      FROM caregiver_alerts ca
      LEFT JOIN users u ON ca.acknowledged_by = u.id
      WHERE ca.circle_id = $1
    `;
    const params = [circleId];

    if (status !== 'all') {
      query += ' AND ca.status = $2';
      params.push(status);
    }

    query += ' ORDER BY ca.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    // Count by severity
    const countResult = await db.query(
      `SELECT severity, COUNT(*) as count
       FROM caregiver_alerts
       WHERE circle_id = $1 AND status = 'active'
       GROUP BY severity`,
      [circleId]
    );

    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    countResult.rows.forEach(row => {
      counts[row.severity] = parseInt(row.count);
    });

    res.json({
      alerts: result.rows,
      counts,
      totalActive: counts.low + counts.medium + counts.high + counts.critical,
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

// Acknowledge an alert
router.post('/circles/:circleId/alerts/:alertId/acknowledge', authMiddleware, async (req, res) => {
  try {
    const { circleId, alertId } = req.params;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const result = await db.query(
      `UPDATE caregiver_alerts
       SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND circle_id = $3
       RETURNING *`,
      [req.user.id, alertId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    broadcastToCircle(circleId, { type: 'alert_acknowledged', alertId });

    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Acknowledge alert error:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Dismiss an alert
router.post('/circles/:circleId/alerts/:alertId/dismiss', authMiddleware, async (req, res) => {
  try {
    const { circleId, alertId } = req.params;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const result = await db.query(
      `UPDATE caregiver_alerts
       SET status = 'dismissed', resolved_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND circle_id = $2
       RETURNING *`,
      [alertId, circleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Dismiss alert error:', error);
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

// ============================================================================
// Check-in Logs Routes
// ============================================================================

// Get check-in logs
router.get('/circles/:circleId/checkins', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { days = 7 } = req.query;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const result = await db.query(
      `SELECT * FROM checkin_logs
       WHERE circle_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [circleId, sinceDate]
    );

    // Calculate response rate
    const total = result.rows.length;
    const responded = result.rows.filter(c => c.response && c.response !== 'no_response').length;
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

    // Group by type
    const byType = {};
    result.rows.forEach(checkin => {
      if (!byType[checkin.checkin_type]) {
        byType[checkin.checkin_type] = { total: 0, responded: 0 };
      }
      byType[checkin.checkin_type].total++;
      if (checkin.response && checkin.response !== 'no_response') {
        byType[checkin.checkin_type].responded++;
      }
    });

    res.json({
      checkins: result.rows,
      summary: {
        total,
        responded,
        responseRate,
      },
      byType,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get check-ins error:', error);
    res.status(500).json({ error: 'Failed to get check-in data' });
  }
});

// Sync check-ins from device
router.post('/circles/:circleId/checkins', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { checkins } = req.body;

    if (!Array.isArray(checkins)) {
      return res.status(400).json({ error: 'Check-ins must be an array' });
    }

    let synced = 0;
    for (const checkin of checkins) {
      await db.query(
        `INSERT INTO checkin_logs (circle_id, checkin_type, message, response, response_text, responded_at, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [circleId, checkin.type, checkin.message, checkin.response, checkin.responseText, checkin.respondedAt, JSON.stringify(checkin.triggeredBy || {})]
      );
      synced++;
    }

    // Check for missed check-ins and create alerts
    const noResponse = checkins.filter(c => c.response === 'no_response').length;
    if (noResponse >= 3) {
      await db.query(
        `INSERT INTO caregiver_alerts (circle_id, alert_type, severity, title, message, data)
         VALUES ($1, 'missed_checkin', 'medium', $2, $3, $4)`,
        [
          circleId,
          `${noResponse} check-ins unanswered`,
          `${noResponse} proactive check-ins went unanswered. This may indicate the user needs attention.`,
          JSON.stringify({ count: noResponse })
        ]
      );

      broadcastToCircle(circleId, { type: 'alert', alertType: 'missed_checkin', count: noResponse });
    }

    res.json({ success: true, synced });
  } catch (error) {
    console.error('Sync check-ins error:', error);
    res.status(500).json({ error: 'Failed to sync check-in data' });
  }
});

// ============================================================================
// Dashboard Summary Route
// ============================================================================

// Get comprehensive dashboard data
router.get('/circles/:circleId/dashboard', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;

    // Check membership
    const memberResult = await db.query(
      'SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2',
      [circleId, req.user.id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Get all data in parallel
    const [
      healthResult,
      adherenceResult,
      activityResult,
      alertsResult,
      checkinsResult,
    ] = await Promise.all([
      // Latest health readings
      db.query(
        `SELECT DISTINCT ON (data_type) * FROM health_data
         WHERE circle_id = $1
         ORDER BY data_type, measured_at DESC`,
        [circleId]
      ),
      // Today's medication adherence
      db.query(
        `SELECT md.status, COUNT(*) as count
         FROM medication_doses md
         WHERE md.circle_id = $1 AND md.scheduled_time >= $2
         GROUP BY md.status`,
        [circleId, today]
      ),
      // Last activity
      db.query(
        `SELECT * FROM activity_logs
         WHERE circle_id = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [circleId]
      ),
      // Active alerts
      db.query(
        `SELECT * FROM caregiver_alerts
         WHERE circle_id = $1 AND status = 'active'
         ORDER BY severity DESC, created_at DESC
         LIMIT 10`,
        [circleId]
      ),
      // Recent check-in response rate
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE response IS NOT NULL AND response != 'no_response') as responded,
           COUNT(*) as total
         FROM checkin_logs
         WHERE circle_id = $1 AND created_at >= $2`,
        [circleId, weekAgo]
      ),
    ]);

    // Process adherence
    const adherence = { taken: 0, missed: 0, skipped: 0, pending: 0 };
    adherenceResult.rows.forEach(row => {
      adherence[row.status] = parseInt(row.count);
    });
    const totalDoses = adherence.taken + adherence.missed + adherence.skipped;
    adherence.rate = totalDoses > 0 ? Math.round((adherence.taken / totalDoses) * 100) : 100;

    // Process activity
    const lastActivity = activityResult.rows[0] || null;
    let inactivityMinutes = null;
    let inactivityStatus = 'unknown';
    if (lastActivity) {
      inactivityMinutes = Math.floor((Date.now() - new Date(lastActivity.recorded_at).getTime()) / 60000);
      if (inactivityMinutes < 60) inactivityStatus = 'active';
      else if (inactivityMinutes < 240) inactivityStatus = 'normal';
      else if (inactivityMinutes < 480) inactivityStatus = 'concerning';
      else inactivityStatus = 'alert';
    }

    // Process check-ins
    const checkinStats = checkinsResult.rows[0] || { responded: 0, total: 0 };
    const checkinResponseRate = checkinStats.total > 0
      ? Math.round((parseInt(checkinStats.responded) / parseInt(checkinStats.total)) * 100)
      : 100;

    res.json({
      health: {
        latest: healthResult.rows,
      },
      adherence: {
        today: adherence,
      },
      activity: {
        lastActivity,
        inactivityMinutes,
        inactivityStatus,
      },
      alerts: {
        active: alertsResult.rows,
        count: alertsResult.rows.length,
      },
      checkins: {
        responseRate: checkinResponseRate,
        total: parseInt(checkinStats.total),
        responded: parseInt(checkinStats.responded),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// ============================================================================
// WebSocket Support
// ============================================================================

const wsClients = new Map(); // circleId -> Set of WebSocket connections

function broadcastToCircle(circleId, event) {
  const clients = wsClients.get(circleId);
  if (clients) {
    const message = JSON.stringify(event);
    clients.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    });
  }
}

// WebSocket connection handler
async function handleWebSocket(ws, req) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const circleId = url.searchParams.get('circleId');

  if (!token || !circleId) {
    ws.close(4001, 'Missing token or circleId');
    return;
  }

  const decoded = verifyJWT(token);
  if (!decoded) {
    ws.close(4002, 'Invalid token');
    return;
  }

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

// Export
module.exports = {
  router,
  handleWebSocket,
  broadcastToCircle,
};

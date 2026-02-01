/**
 * Admin Panel API Module
 *
 * Handles admin authentication, user management, circle management,
 * system metrics, audit logs, and feature flags.
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const router = express.Router();

// Defense-in-depth: Verify custom header on mutating requests
// Browsers won't send X-Requested-With cross-origin without CORS preflight
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Forbidden: missing required header' });
    }
  }
  next();
});

const BCRYPT_ROUNDS = 12;

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

// Admin login rate limiter: 5 attempts per 15 minutes per IP (stricter for admin)
const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.warn(`[RateLimit] Admin login rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

// ============================================================================
// Configuration
// ============================================================================

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_JWT_EXPIRES_IN = '24h';

// Admin role permissions
const ADMIN_ROLE_PERMISSIONS = {
  super_admin: {
    canManageAdmins: true,
    canManageUsers: true,
    canManageCircles: true,
    canManageSettings: true,
    canManageFeatureFlags: true,
    canViewMetrics: true,
    canViewAuditLogs: true,
    canSendNotifications: true,
    canExportData: true,
  },
  admin: {
    canManageAdmins: false,
    canManageUsers: true,
    canManageCircles: true,
    canManageSettings: false,
    canManageFeatureFlags: true,
    canViewMetrics: true,
    canViewAuditLogs: true,
    canSendNotifications: true,
    canExportData: true,
  },
  support: {
    canManageAdmins: false,
    canManageUsers: true,
    canManageCircles: true,
    canManageSettings: false,
    canManageFeatureFlags: false,
    canViewMetrics: true,
    canViewAuditLogs: true,
    canSendNotifications: false,
    canExportData: false,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

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
    const legacyHash = crypto.createHash('sha256').update(password + ADMIN_JWT_SECRET).digest('hex');
    return hash === legacyHash;
  }
}

function createAdminJWT(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_JWT_EXPIRES_IN }
  );
}

function verifyAdminJWT(token) {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET);
  } catch (error) {
    // Log admin JWT verification failures for security monitoring
    if (error.name === 'TokenExpiredError') {
      console.warn('[AdminAuth] JWT expired:', { expiredAt: error.expiredAt });
    } else if (error.name === 'JsonWebTokenError') {
      console.warn('[AdminAuth] Invalid JWT:', { message: error.message });
    } else if (error.name === 'NotBeforeError') {
      console.warn('[AdminAuth] JWT not yet valid:', { date: error.date });
    } else {
      console.warn('[AdminAuth] JWT verification failed:', { error: error.message });
    }
    return null;
  }
}

async function logAdminAction(adminId, adminEmail, action, resourceType, resourceId, oldValue, newValue, req) {
  try {
    await db.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_email, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [adminId, adminEmail, action, resourceType, resourceId,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null,
       req.ip, req.headers['user-agent']]
    );
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyAdminJWT(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.admin = decoded;
  req.adminPermissions = ADMIN_ROLE_PERMISSIONS[decoded.role] || {};
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.adminPermissions[permission]) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    next();
  };
}

// ============================================================================
// Auth Routes
// ============================================================================

// Admin login
router.post('/auth/login', adminLoginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query(
      'SELECT * FROM admin_users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const admin = result.rows[0];

    const passwordValid = await verifyPassword(password, admin.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Upgrade legacy hash to bcrypt on successful login
    if (!admin.password_hash.startsWith('$2b$') && !admin.password_hash.startsWith('$2a$')) {
      const newHash = await hashPassword(password);
      await db.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [newHash, admin.id]);
    }

    // Update login stats
    await db.query(
      'UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = $1',
      [admin.id]
    );

    const token = createAdminJWT(admin);

    await logAdminAction(admin.id, admin.email, 'login', 'admin', admin.id, null, null, req);

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: ADMIN_ROLE_PERMISSIONS[admin.role],
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin
router.get('/auth/me', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, last_login_at FROM admin_users WHERE id = $1',
      [req.admin.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const admin = result.rows[0];

    res.json({
      admin: {
        ...admin,
        permissions: ADMIN_ROLE_PERMISSIONS[admin.role],
      },
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Create admin (super_admin only)
router.post('/auth/create', adminAuthMiddleware, requirePermission('canManageAdmins'), async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (role && !['admin', 'support'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await db.query('SELECT id FROM admin_users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO admin_users (email, password_hash, name, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role`,
      [email.toLowerCase(), passwordHash, name, role || 'admin', req.admin.id]
    );

    await logAdminAction(req.admin.id, req.admin.email, 'create_admin', 'admin', result.rows[0].id, null, { email, name, role }, req);

    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// ============================================================================
// User Management Routes
// ============================================================================

// List all users
router.get('/users', adminAuthMiddleware, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT u.id, u.email, u.name, u.phone, u.is_active, u.is_verified,
             u.suspended_at, u.last_login_at, u.login_count, u.created_at,
             COUNT(cm.id) as circle_count
      FROM users u
      LEFT JOIN circle_members cm ON u.id = cm.user_id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`(u.email ILIKE $${params.length + 1} OR u.name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (status === 'active') {
      conditions.push('u.is_active = true AND u.suspended_at IS NULL');
    } else if (status === 'suspended') {
      conditions.push('u.suspended_at IS NOT NULL');
    } else if (status === 'inactive') {
      conditions.push('u.is_active = false');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users u';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get user details
router.get('/users/:userId', adminAuthMiddleware, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await db.query(
      `SELECT u.*,
              (SELECT COUNT(*) FROM circle_members WHERE user_id = u.id) as circle_count
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    delete user.password_hash;

    // Get user's circles
    const circlesResult = await db.query(
      `SELECT cc.*, cm.role, cm.joined_at
       FROM care_circles cc
       JOIN circle_members cm ON cc.id = cm.circle_id
       WHERE cm.user_id = $1`,
      [userId]
    );

    // Get recent activity
    const activityResult = await db.query(
      `SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    res.json({
      user,
      circles: circlesResult.rows,
      recentActivity: activityResult.rows,
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Suspend user
router.post('/users/:userId/suspend', adminAuthMiddleware, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const oldResult = await db.query('SELECT is_active, suspended_at FROM users WHERE id = $1', [userId]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.query(
      `UPDATE users SET suspended_at = CURRENT_TIMESTAMP, suspended_reason = $1, suspended_by = $2
       WHERE id = $3`,
      [reason, req.admin.id, userId]
    );

    await logAdminAction(req.admin.id, req.admin.email, 'suspend_user', 'user', userId, oldResult.rows[0], { suspended: true, reason }, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// Unsuspend user
router.post('/users/:userId/unsuspend', adminAuthMiddleware, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;

    const oldResult = await db.query('SELECT suspended_at, suspended_reason FROM users WHERE id = $1', [userId]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.query(
      'UPDATE users SET suspended_at = NULL, suspended_reason = NULL, suspended_by = NULL WHERE id = $1',
      [userId]
    );

    await logAdminAction(req.admin.id, req.admin.email, 'unsuspend_user', 'user', userId, oldResult.rows[0], { suspended: false }, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Unsuspend user error:', error);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

// Reset user password
router.post('/users/:userId/reset-password', adminAuthMiddleware, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Use bcrypt for password hashing (same as careCircle.js)
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

    await logAdminAction(req.admin.id, req.admin.email, 'reset_password', 'user', userId, null, { passwordReset: true }, req);

    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================================
// Care Circle Management Routes
// ============================================================================

// List all circles
router.get('/circles', adminAuthMiddleware, requirePermission('canManageCircles'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT cc.*,
             (SELECT COUNT(*) FROM circle_members WHERE circle_id = cc.id) as member_count,
             (SELECT u.name FROM users u JOIN circle_members cm ON u.id = cm.user_id
              WHERE cm.circle_id = cc.id AND cm.role = 'owner' LIMIT 1) as owner_name
      FROM care_circles cc
    `;
    const params = [];

    if (search) {
      query += ` WHERE cc.name ILIKE $1 OR cc.care_recipient_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY cc.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM care_circles cc';
    if (search) {
      countQuery += ` WHERE cc.name ILIKE $1 OR cc.care_recipient_name ILIKE $1`;
    }
    const countResult = await db.query(countQuery, search ? [`%${search}%`] : []);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      circles: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('List circles error:', error);
    res.status(500).json({ error: 'Failed to list circles' });
  }
});

// Get circle details
router.get('/circles/:circleId', adminAuthMiddleware, requirePermission('canManageCircles'), async (req, res) => {
  try {
    const { circleId } = req.params;

    const circleResult = await db.query('SELECT * FROM care_circles WHERE id = $1', [circleId]);
    if (circleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found' });
    }

    const circle = circleResult.rows[0];

    // Get members
    const membersResult = await db.query(
      `SELECT cm.*, u.email, u.name
       FROM circle_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.circle_id = $1`,
      [circleId]
    );

    // Get stats
    const statsResult = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM vault_medications WHERE circle_id = $1) as medications,
        (SELECT COUNT(*) FROM vault_appointments WHERE circle_id = $1 AND status = 'scheduled') as appointments,
        (SELECT COUNT(*) FROM vault_notes WHERE circle_id = $1) as notes,
        (SELECT COUNT(*) FROM health_data WHERE circle_id = $1) as health_records,
        (SELECT COUNT(*) FROM caregiver_alerts WHERE circle_id = $1 AND status = 'active') as active_alerts
    `, [circleId]);

    res.json({
      circle,
      members: membersResult.rows,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error('Get circle details error:', error);
    res.status(500).json({ error: 'Failed to get circle details' });
  }
});

// ============================================================================
// System Metrics Routes
// ============================================================================

// Get dashboard metrics
router.get('/metrics/dashboard', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const [users, circles, activity, alerts] = await Promise.all([
      // User stats
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true AND suspended_at IS NULL) as active,
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_last_week,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_last_month
        FROM users
      `),
      // Circle stats
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          AVG((SELECT COUNT(*) FROM circle_members WHERE circle_id = cc.id)) as avg_members
        FROM care_circles cc
      `),
      // Activity stats (last 24h)
      db.query(`
        SELECT
          COUNT(*) as total_activities,
          COUNT(DISTINCT circle_id) as active_circles
        FROM activity_logs
        WHERE recorded_at > NOW() - INTERVAL '24 hours'
      `),
      // Alert stats
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical,
          COUNT(*) FILTER (WHERE severity = 'high' AND status = 'active') as high
        FROM caregiver_alerts
      `),
    ]);

    res.json({
      users: users.rows[0],
      circles: circles.rows[0],
      activity: activity.rows[0],
      alerts: alerts.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get detailed metrics
router.get('/metrics/detailed', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Daily user signups
    const signupsResult = await db.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [sinceDate]);

    // Daily active users
    const dauResult = await db.query(`
      SELECT DATE(recorded_at) as date, COUNT(DISTINCT circle_id) as count
      FROM activity_logs
      WHERE recorded_at >= $1
      GROUP BY DATE(recorded_at)
      ORDER BY date
    `, [sinceDate]);

    // Alerts by type
    const alertsResult = await db.query(`
      SELECT alert_type, COUNT(*) as count
      FROM caregiver_alerts
      WHERE created_at >= $1
      GROUP BY alert_type
    `, [sinceDate]);

    // Medication adherence average
    const adherenceResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'taken') as taken,
        COUNT(*) as total
      FROM medication_doses
      WHERE scheduled_time >= $1
    `, [sinceDate]);

    const adherence = adherenceResult.rows[0];
    const adherenceRate = adherence.total > 0
      ? Math.round((parseInt(adherence.taken) / parseInt(adherence.total)) * 100)
      : 0;

    res.json({
      signups: signupsResult.rows,
      dailyActiveUsers: dauResult.rows,
      alertsByType: alertsResult.rows,
      medicationAdherence: {
        ...adherence,
        rate: adherenceRate,
      },
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get detailed metrics error:', error);
    res.status(500).json({ error: 'Failed to get detailed metrics' });
  }
});

// ============================================================================
// Audit Logs Routes
// ============================================================================

// Get audit logs
router.get('/audit-logs', adminAuthMiddleware, requirePermission('canViewAuditLogs'), async (req, res) => {
  try {
    const { page = 1, limit = 100, action, userId, circleId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (action) {
      params.push(action);
      query += ` AND action = $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (circleId) {
      params.push(circleId);
      query += ` AND circle_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Get admin audit logs
router.get('/admin-audit-logs', adminAuthMiddleware, requirePermission('canViewAuditLogs'), async (req, res) => {
  try {
    const { page = 1, limit = 100, action, adminId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM admin_audit_logs WHERE 1=1';
    const params = [];

    if (action) {
      params.push(action);
      query += ` AND action = $${params.length}`;
    }

    if (adminId) {
      params.push(adminId);
      query += ` AND admin_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get admin audit logs error:', error);
    res.status(500).json({ error: 'Failed to get admin audit logs' });
  }
});

// ============================================================================
// Feature Flags Routes
// ============================================================================

// List feature flags
router.get('/feature-flags', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM feature_flags ORDER BY name');
    res.json({ flags: result.rows });
  } catch (error) {
    console.error('List feature flags error:', error);
    res.status(500).json({ error: 'Failed to list feature flags' });
  }
});

// Update feature flag
router.put('/feature-flags/:flagId', adminAuthMiddleware, requirePermission('canManageFeatureFlags'), async (req, res) => {
  try {
    const { flagId } = req.params;
    const { is_enabled, enabled_for_all, rollout_percentage, enabled_user_ids, enabled_circle_ids } = req.body;

    const oldResult = await db.query('SELECT * FROM feature_flags WHERE id = $1', [flagId]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Feature flag not found' });
    }

    const result = await db.query(`
      UPDATE feature_flags SET
        is_enabled = COALESCE($1, is_enabled),
        enabled_for_all = COALESCE($2, enabled_for_all),
        rollout_percentage = COALESCE($3, rollout_percentage),
        enabled_user_ids = COALESCE($4, enabled_user_ids),
        enabled_circle_ids = COALESCE($5, enabled_circle_ids)
      WHERE id = $6
      RETURNING *
    `, [is_enabled, enabled_for_all, rollout_percentage, enabled_user_ids, enabled_circle_ids, flagId]);

    await logAdminAction(req.admin.id, req.admin.email, 'update_feature_flag', 'feature_flag', flagId, oldResult.rows[0], result.rows[0], req);

    res.json({ success: true, flag: result.rows[0] });
  } catch (error) {
    console.error('Update feature flag error:', error);
    res.status(500).json({ error: 'Failed to update feature flag' });
  }
});

// Create feature flag
router.post('/feature-flags', adminAuthMiddleware, requirePermission('canManageFeatureFlags'), async (req, res) => {
  try {
    const { name, description, is_enabled, enabled_for_all } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await db.query(`
      INSERT INTO feature_flags (name, description, is_enabled, enabled_for_all, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, is_enabled || false, enabled_for_all || false, req.admin.id]);

    await logAdminAction(req.admin.id, req.admin.email, 'create_feature_flag', 'feature_flag', result.rows[0].id, null, result.rows[0], req);

    res.json({ success: true, flag: result.rows[0] });
  } catch (error) {
    console.error('Create feature flag error:', error);
    res.status(500).json({ error: 'Failed to create feature flag' });
  }
});

// ============================================================================
// System Settings Routes
// ============================================================================

// Get all settings
router.get('/settings', adminAuthMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM system_settings ORDER BY category, key');

    // Group by category
    const settings = {};
    result.rows.forEach(row => {
      if (!settings[row.category]) {
        settings[row.category] = [];
      }
      settings[row.category].push(row);
    });

    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update setting
router.put('/settings/:key', adminAuthMiddleware, requirePermission('canManageSettings'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const oldResult = await db.query('SELECT * FROM system_settings WHERE key = $1', [key]);
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    const result = await db.query(
      'UPDATE system_settings SET value = $1, updated_by = $2 WHERE key = $3 RETURNING *',
      [JSON.stringify(value), req.admin.id, key]
    );

    await logAdminAction(req.admin.id, req.admin.email, 'update_setting', 'setting', oldResult.rows[0].id, oldResult.rows[0], result.rows[0], req);

    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ============================================================================
// Notification Routes
// ============================================================================

// Send notification to users
router.post('/notifications/send', adminAuthMiddleware, requirePermission('canSendNotifications'), async (req, res) => {
  try {
    const { recipient_type, recipient_id, notification_type, title, message, priority, scheduled_at } = req.body;

    if (!title || !message || !notification_type) {
      return res.status(400).json({ error: 'Title, message, and notification_type are required' });
    }

    const result = await db.query(`
      INSERT INTO notification_queue (recipient_type, recipient_id, notification_type, title, message, priority, scheduled_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [recipient_type || 'all', recipient_id, notification_type, title, message, priority || 'normal', scheduled_at, req.admin.id]);

    await logAdminAction(req.admin.id, req.admin.email, 'send_notification', 'notification', result.rows[0].id, null, result.rows[0], req);

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ============================================================================
// AI Usage Analytics Routes
// ============================================================================

// Get AI usage summary
router.get('/ai-usage/summary', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const [summary, byModel, byType, dailyUsage] = await Promise.all([
      // Overall summary
      db.query(`
        SELECT
          COUNT(*) as total_requests,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(estimated_cost_usd) as total_cost,
          AVG(latency_ms) as avg_latency,
          COUNT(*) FILTER (WHERE success = true) as successful_requests,
          COUNT(*) FILTER (WHERE success = false) as failed_requests
        FROM ai_usage_logs
        WHERE created_at >= $1
      `, [sinceDate]),

      // Usage by model
      db.query(`
        SELECT
          model,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(estimated_cost_usd) as cost,
          AVG(latency_ms) as avg_latency
        FROM ai_usage_logs
        WHERE created_at >= $1
        GROUP BY model
        ORDER BY requests DESC
      `, [sinceDate]),

      // Usage by type
      db.query(`
        SELECT
          request_type,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(estimated_cost_usd) as cost,
          AVG(latency_ms) as avg_latency
        FROM ai_usage_logs
        WHERE created_at >= $1
        GROUP BY request_type
        ORDER BY requests DESC
      `, [sinceDate]),

      // Daily usage trend
      db.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as requests,
          SUM(total_tokens) as tokens,
          SUM(estimated_cost_usd) as cost
        FROM ai_usage_logs
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [sinceDate]),
    ]);

    const summaryData = summary.rows[0];
    const successRate = summaryData.total_requests > 0
      ? ((parseInt(summaryData.successful_requests) / parseInt(summaryData.total_requests)) * 100).toFixed(1)
      : 0;

    res.json({
      summary: {
        ...summaryData,
        success_rate: successRate,
      },
      byModel: byModel.rows,
      byType: byType.rows,
      dailyUsage: dailyUsage.rows,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get AI usage summary error:', error);
    res.status(500).json({ error: 'Failed to get AI usage summary' });
  }
});

// Get AI usage logs (detailed)
router.get('/ai-usage/logs', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { page = 1, limit = 100, request_type, model, success } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT aul.*, u.name as user_name, cc.name as circle_name
      FROM ai_usage_logs aul
      LEFT JOIN users u ON aul.user_id = u.id
      LEFT JOIN care_circles cc ON aul.circle_id = cc.id
      WHERE 1=1
    `;
    const params = [];

    if (request_type) {
      params.push(request_type);
      query += ` AND aul.request_type = $${params.length}`;
    }

    if (model) {
      params.push(model);
      query += ` AND aul.model = $${params.length}`;
    }

    if (success !== undefined) {
      params.push(success === 'true');
      query += ` AND aul.success = $${params.length}`;
    }

    query += ' ORDER BY aul.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get AI usage logs error:', error);
    res.status(500).json({ error: 'Failed to get AI usage logs' });
  }
});

// ============================================================================
// Health Alerts Dashboard Routes
// ============================================================================

// Get health alerts overview
router.get('/health-alerts/overview', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const [summary, bySeverity, byType, recentAlerts, topCircles] = await Promise.all([
      // Overall summary
      db.query(`
        SELECT
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE status = 'active') as active_alerts,
          COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_alerts,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved_alerts,
          COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical_active,
          COUNT(*) FILTER (WHERE severity = 'high' AND status = 'active') as high_active,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as alerts_today,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as alerts_this_week
        FROM caregiver_alerts
      `),

      // Alerts by severity
      db.query(`
        SELECT
          severity,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active
        FROM caregiver_alerts
        GROUP BY severity
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END
      `),

      // Alerts by type
      db.query(`
        SELECT
          alert_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active
        FROM caregiver_alerts
        GROUP BY alert_type
        ORDER BY total DESC
      `),

      // Recent critical/high alerts
      db.query(`
        SELECT ca.*, cc.name as circle_name, cc.care_recipient_name
        FROM caregiver_alerts ca
        JOIN care_circles cc ON ca.circle_id = cc.id
        WHERE ca.severity IN ('critical', 'high') AND ca.status = 'active'
        ORDER BY ca.created_at DESC
        LIMIT 20
      `),

      // Circles with most alerts
      db.query(`
        SELECT
          cc.id,
          cc.name,
          cc.care_recipient_name,
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE ca.status = 'active') as active_alerts
        FROM care_circles cc
        JOIN caregiver_alerts ca ON cc.id = ca.circle_id
        GROUP BY cc.id
        ORDER BY active_alerts DESC, total_alerts DESC
        LIMIT 10
      `),
    ]);

    res.json({
      summary: summary.rows[0],
      bySeverity: bySeverity.rows,
      byType: byType.rows,
      recentAlerts: recentAlerts.rows,
      topCircles: topCircles.rows,
    });
  } catch (error) {
    console.error('Get health alerts overview error:', error);
    res.status(500).json({ error: 'Failed to get health alerts overview' });
  }
});

// Get health alerts list
router.get('/health-alerts', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, severity, alert_type, circle_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT ca.*, cc.name as circle_name, cc.care_recipient_name,
             u.name as acknowledged_by_name
      FROM caregiver_alerts ca
      JOIN care_circles cc ON ca.circle_id = cc.id
      LEFT JOIN users u ON ca.acknowledged_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND ca.status = $${params.length}`;
    }

    if (severity) {
      params.push(severity);
      query += ` AND ca.severity = $${params.length}`;
    }

    if (alert_type) {
      params.push(alert_type);
      query += ` AND ca.alert_type = $${params.length}`;
    }

    if (circle_id) {
      params.push(circle_id);
      query += ` AND ca.circle_id = $${params.length}`;
    }

    query += ' ORDER BY ca.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM caregiver_alerts ca WHERE 1=1';
    const countParams = [];
    if (status) {
      countParams.push(status);
      countQuery += ` AND ca.status = $${countParams.length}`;
    }
    if (severity) {
      countParams.push(severity);
      countQuery += ` AND ca.severity = $${countParams.length}`;
    }
    if (alert_type) {
      countParams.push(alert_type);
      countQuery += ` AND ca.alert_type = $${countParams.length}`;
    }
    if (circle_id) {
      countParams.push(circle_id);
      countQuery += ` AND ca.circle_id = $${countParams.length}`;
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      alerts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get health alerts error:', error);
    res.status(500).json({ error: 'Failed to get health alerts' });
  }
});

// Get health data trends
router.get('/health-alerts/trends', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const [dailyAlerts, healthMetrics] = await Promise.all([
      // Daily alert counts
      db.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE severity = 'high') as high,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium,
          COUNT(*) FILTER (WHERE severity = 'low') as low
        FROM caregiver_alerts
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [sinceDate]),

      // Health data summary (heart rate, blood pressure, etc.)
      db.query(`
        SELECT
          data_type,
          COUNT(*) as readings,
          AVG(CAST(value->>'value' AS NUMERIC)) as avg_value,
          MIN(CAST(value->>'value' AS NUMERIC)) as min_value,
          MAX(CAST(value->>'value' AS NUMERIC)) as max_value
        FROM health_data
        WHERE measured_at >= $1
        GROUP BY data_type
      `, [sinceDate]),
    ]);

    res.json({
      dailyAlerts: dailyAlerts.rows,
      healthMetrics: healthMetrics.rows,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get health trends error:', error);
    res.status(500).json({ error: 'Failed to get health trends' });
  }
});

// ============================================================================
// Medication Reports Routes
// ============================================================================

// Get medication overview
router.get('/medications/overview', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const [summary, adherenceByCircle, topMedications, missedDoses] = await Promise.all([
      // Overall adherence summary
      db.query(`
        SELECT
          COUNT(*) as total_doses,
          COUNT(*) FILTER (WHERE status = 'taken') as taken,
          COUNT(*) FILTER (WHERE status = 'missed') as missed,
          COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(DISTINCT medication_id) as unique_medications,
          COUNT(DISTINCT circle_id) as circles_with_medications
        FROM medication_doses
        WHERE scheduled_time >= $1
      `, [sinceDate]),

      // Adherence by circle
      db.query(`
        SELECT
          cc.id,
          cc.name,
          cc.care_recipient_name,
          COUNT(*) as total_doses,
          COUNT(*) FILTER (WHERE md.status = 'taken') as taken,
          COUNT(*) FILTER (WHERE md.status = 'missed') as missed,
          ROUND(
            (COUNT(*) FILTER (WHERE md.status = 'taken')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE md.status != 'pending'), 0) * 100), 1
          ) as adherence_rate
        FROM care_circles cc
        JOIN medication_doses md ON cc.id = md.circle_id
        WHERE md.scheduled_time >= $1
        GROUP BY cc.id
        ORDER BY adherence_rate ASC NULLS LAST
        LIMIT 20
      `, [sinceDate]),

      // Most prescribed medications
      db.query(`
        SELECT
          vm.name,
          vm.dosage,
          COUNT(DISTINCT vm.circle_id) as circles_using,
          COUNT(md.id) as total_doses,
          ROUND(
            (COUNT(*) FILTER (WHERE md.status = 'taken')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE md.status != 'pending'), 0) * 100), 1
          ) as adherence_rate
        FROM vault_medications vm
        LEFT JOIN medication_doses md ON vm.id = md.medication_id AND md.scheduled_time >= $1
        GROUP BY vm.name, vm.dosage
        ORDER BY circles_using DESC
        LIMIT 15
      `, [sinceDate]),

      // Recent missed doses with details
      db.query(`
        SELECT
          md.*,
          vm.name as medication_name,
          vm.dosage,
          cc.name as circle_name,
          cc.care_recipient_name
        FROM medication_doses md
        JOIN vault_medications vm ON md.medication_id = vm.id
        JOIN care_circles cc ON md.circle_id = cc.id
        WHERE md.status = 'missed' AND md.scheduled_time >= $1
        ORDER BY md.scheduled_time DESC
        LIMIT 50
      `, [sinceDate]),
    ]);

    const summaryData = summary.rows[0];
    const completedDoses = parseInt(summaryData.taken) + parseInt(summaryData.missed) + parseInt(summaryData.skipped);
    const adherenceRate = completedDoses > 0
      ? ((parseInt(summaryData.taken) / completedDoses) * 100).toFixed(1)
      : 0;

    res.json({
      summary: {
        ...summaryData,
        adherence_rate: adherenceRate,
      },
      adherenceByCircle: adherenceByCircle.rows,
      topMedications: topMedications.rows,
      missedDoses: missedDoses.rows,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get medication overview error:', error);
    res.status(500).json({ error: 'Failed to get medication overview' });
  }
});

// Get medication adherence trends
router.get('/medications/trends', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    const [dailyAdherence, hourlyPattern] = await Promise.all([
      // Daily adherence trend
      db.query(`
        SELECT
          DATE(scheduled_time) as date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'taken') as taken,
          COUNT(*) FILTER (WHERE status = 'missed') as missed,
          ROUND(
            (COUNT(*) FILTER (WHERE status = 'taken')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0) * 100), 1
          ) as adherence_rate
        FROM medication_doses
        WHERE scheduled_time >= $1
        GROUP BY DATE(scheduled_time)
        ORDER BY date
      `, [sinceDate]),

      // Hourly pattern (which hours have most missed doses)
      db.query(`
        SELECT
          EXTRACT(HOUR FROM scheduled_time) as hour,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'taken') as taken,
          COUNT(*) FILTER (WHERE status = 'missed') as missed
        FROM medication_doses
        WHERE scheduled_time >= $1
        GROUP BY EXTRACT(HOUR FROM scheduled_time)
        ORDER BY hour
      `, [sinceDate]),
    ]);

    res.json({
      dailyAdherence: dailyAdherence.rows,
      hourlyPattern: hourlyPattern.rows,
      period: { days: parseInt(days), since: sinceDate },
    });
  } catch (error) {
    console.error('Get medication trends error:', error);
    res.status(500).json({ error: 'Failed to get medication trends' });
  }
});

// Get medication list for admin
router.get('/medications', adminAuthMiddleware, requirePermission('canViewMetrics'), async (req, res) => {
  try {
    const { page = 1, limit = 50, circle_id, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        vm.*,
        cc.name as circle_name,
        cc.care_recipient_name,
        (SELECT COUNT(*) FROM medication_doses WHERE medication_id = vm.id AND status = 'taken') as doses_taken,
        (SELECT COUNT(*) FROM medication_doses WHERE medication_id = vm.id AND status = 'missed') as doses_missed
      FROM vault_medications vm
      JOIN care_circles cc ON vm.circle_id = cc.id
      WHERE 1=1
    `;
    const params = [];

    if (circle_id) {
      params.push(circle_id);
      query += ` AND vm.circle_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (vm.name ILIKE $${params.length} OR cc.care_recipient_name ILIKE $${params.length})`;
    }

    query += ' ORDER BY vm.created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    res.json({
      medications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ error: 'Failed to get medications' });
  }
});

// ============================================================================
// Export
// ============================================================================

module.exports = {
  router,
  adminAuthMiddleware,
  ADMIN_ROLE_PERMISSIONS,
};

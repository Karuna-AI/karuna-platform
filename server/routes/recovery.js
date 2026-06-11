/**
 * Vault PIN Recovery routes — caregiver-assisted escrow (H3 Phase 2/3).
 *
 * Extracted verbatim from server/careCircle.js. careCircle.js mounts this at
 * the original section position so Express route registration order is
 * unchanged. The at-rest crypto helpers live here; JWT_SECRET is read from
 * process.env at call time (matches the original).
 */

const crypto = require('crypto');

module.exports = function mountRecoveryRoutes(router, deps) {
const { db, authMiddleware, requirePermission, broadcastToCircle } = deps;

// ============================================================================
// Vault PIN Recovery — caregiver-assisted escrow (H3 Phase 2/3)
// ============================================================================
// The device wraps its vault DEK under a random recovery key and escrows
// { wrapped_dek, recovery_key } here. Recovery requires approval by ANOTHER
// circle member (canApproveRecovery) before the gateway releases the material.
// The recovery key is encrypted at rest (AES-256-GCM under a JWT_SECRET-derived
// key) so a DB dump alone doesn't reveal it. See docs/VAULT_PIN_RECOVERY_DESIGN.md.

function recoveryAtRestKey() {
  return crypto.createHash('sha256').update(`vault-recovery:${process.env.JWT_SECRET || ''}`).digest();
}
function encryptAtRest(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', recoveryAtRestKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}
function decryptAtRest(stored) {
  const [ivB64, tagB64, ctB64] = String(stored).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', recoveryAtRestKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
async function getMemberRole(circleId, userId) {
  const r = await db.query('SELECT role FROM circle_members WHERE circle_id = $1 AND user_id = $2', [circleId, userId]);
  return r.rows.length ? r.rows[0].role : null;
}

// 1) Store/refresh this user's recovery escrow for the circle.
router.post('/circles/:circleId/recovery/escrow', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const { wrappedDek, recoveryKey } = req.body;
    if (!wrappedDek || !recoveryKey) {
      return res.status(400).json({ error: 'wrappedDek and recoveryKey are required' });
    }
    if (!(await getMemberRole(circleId, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }
    await db.query(
      `INSERT INTO vault_recovery_escrow (user_id, circle_id, wrapped_dek, recovery_key, status, updated_at)
       VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, circle_id) DO UPDATE
         SET wrapped_dek = EXCLUDED.wrapped_dek, recovery_key = EXCLUDED.recovery_key,
             status = 'active', requested_at = NULL, approved_by = NULL, approved_at = NULL,
             updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, circleId, wrappedDek, encryptAtRest(recoveryKey)]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Recovery escrow error:', error);
    res.status(500).json({ error: 'Failed to store recovery escrow' });
  }
});

// 2) Request recovery (the user who forgot their PIN). Notifies approvers.
router.post('/circles/:circleId/recovery/request', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    if (!(await getMemberRole(circleId, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }
    const upd = await db.query(
      `UPDATE vault_recovery_escrow
         SET status = 'pending', requested_at = CURRENT_TIMESTAMP,
             approved_by = NULL, approved_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND circle_id = $2 RETURNING id`,
      [req.user.id, circleId]
    );
    if (upd.rows.length === 0) {
      return res.status(404).json({ error: 'Recovery was not set up for this vault' });
    }
    const requester = await db.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const requesterName = requester.rows[0]?.name || 'A member';
    db.query(
      `INSERT INTO caregiver_alerts (circle_id, alert_type, severity, title, message, data)
       VALUES ($1, 'vault_recovery_request', 'high', $2, $3, $4)`,
      [circleId, 'Vault recovery requested',
       `${requesterName} is asking to recover their vault PIN. Approve only if you trust this request.`,
       JSON.stringify({ requesterId: req.user.id, requesterName })]
    ).catch((e) => console.error('[Recovery] alert insert failed:', e));
    broadcastToCircle(circleId, { type: 'recovery_request', requesterId: req.user.id, requesterName });
    db.query(
      `INSERT INTO audit_logs (user_id, circle_id, action, category, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, 'vault_recovery_requested', 'security', $3, $4, $5, $6)`,
      [req.user.id, circleId, `${requesterName} requested vault PIN recovery`,
       JSON.stringify({ requesterName }), req.ip, req.headers['user-agent']]
    ).catch(() => {});
    res.json({ success: true, status: 'pending' });
  } catch (error) {
    console.error('Recovery request error:', error);
    res.status(500).json({ error: 'Failed to request recovery' });
  }
});

// 3) Poll recovery status (requesting user).
router.get('/circles/:circleId/recovery/status', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    const r = await db.query(
      'SELECT status FROM vault_recovery_escrow WHERE user_id = $1 AND circle_id = $2',
      [req.user.id, circleId]
    );
    res.json({ status: r.rows[0]?.status || 'none' });
  } catch (error) {
    console.error('Recovery status error:', error);
    res.status(500).json({ error: 'Failed to get recovery status' });
  }
});

// 4) List pending recovery requests (approvers only).
router.get('/circles/:circleId/recovery/requests', authMiddleware, requirePermission('canApproveRecovery'), async (req, res) => {
  try {
    const { circleId } = req.params;
    const result = await db.query(
      `SELECT e.user_id AS "userId", u.name, u.email, e.requested_at AS "requestedAt"
         FROM vault_recovery_escrow e JOIN users u ON e.user_id = u.id
       WHERE e.circle_id = $1 AND e.status = 'pending'
       ORDER BY e.requested_at ASC`,
      [circleId]
    );
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Recovery list error:', error);
    res.status(500).json({ error: 'Failed to list recovery requests' });
  }
});

// 5) Approve a pending recovery request (approver must differ from requester).
router.post('/circles/:circleId/recovery/:requesterId/approve', authMiddleware, requirePermission('canApproveRecovery'), async (req, res) => {
  try {
    const { circleId, requesterId } = req.params;
    if (requesterId === req.user.id) {
      return res.status(403).json({ error: 'You cannot approve your own recovery request' });
    }
    const upd = await db.query(
      `UPDATE vault_recovery_escrow
         SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND circle_id = $3 AND status = 'pending' RETURNING id`,
      [req.user.id, requesterId, circleId]
    );
    if (upd.rows.length === 0) {
      return res.status(404).json({ error: 'No pending recovery request found' });
    }
    db.query(
      `INSERT INTO audit_logs (user_id, circle_id, action, category, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, 'vault_recovery_approved', 'security', $3, $4, $5, $6)`,
      [req.user.id, circleId, `${req.member?.name || 'A member'} approved a vault recovery request`,
       JSON.stringify({ requesterId, approverId: req.user.id }), req.ip, req.headers['user-agent']]
    ).catch(() => {});
    broadcastToCircle(circleId, { type: 'recovery_approved', requesterId });
    res.json({ success: true, status: 'approved' });
  } catch (error) {
    console.error('Recovery approve error:', error);
    res.status(500).json({ error: 'Failed to approve recovery' });
  }
});

// 6) Fetch recovery material once approved (requesting user). One-shot → resets to 'active'.
router.get('/circles/:circleId/recovery/material', authMiddleware, async (req, res) => {
  try {
    const { circleId } = req.params;
    if (!(await getMemberRole(circleId, req.user.id))) {
      return res.status(403).json({ error: 'Not a member of this circle' });
    }
    const result = await db.query(
      'SELECT wrapped_dek, recovery_key, status FROM vault_recovery_escrow WHERE user_id = $1 AND circle_id = $2',
      [req.user.id, circleId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No recovery escrow found' });
    const row = result.rows[0];
    if (row.status !== 'approved') {
      return res.status(403).json({ error: 'Recovery not approved yet', status: row.status });
    }
    await db.query(
      `UPDATE vault_recovery_escrow
         SET status = 'active', requested_at = NULL, approved_by = NULL, approved_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND circle_id = $2`,
      [req.user.id, circleId]
    );
    db.query(
      `INSERT INTO audit_logs (user_id, circle_id, action, category, description, metadata, ip_address, user_agent)
       VALUES ($1, $2, 'vault_recovery_completed', 'security', 'Vault recovery material released to device', '{}', $3, $4)`,
      [req.user.id, circleId, req.ip, req.headers['user-agent']]
    ).catch(() => {});
    res.json({ wrappedDek: row.wrapped_dek, recoveryKey: decryptAtRest(row.recovery_key) });
  } catch (error) {
    console.error('Recovery material error:', error);
    res.status(500).json({ error: 'Failed to fetch recovery material' });
  }
});

};

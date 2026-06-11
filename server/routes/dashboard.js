/**
 * Dashboard Summary route (incl. the camelizeRow helper it uses).
 *
 * Extracted verbatim from server/careCircle.js. careCircle.js mounts this at
 * the original section position so Express route registration order is
 * unchanged.
 */

module.exports = function mountDashboardRoutes(router, deps) {
const { db, authMiddleware } = deps;

// ============================================================================
// Dashboard Summary Route
// ============================================================================

// Get comprehensive dashboard data
// Convert snake_case keys to camelCase so portal/mobile clients can use the
// fields directly without per-table normalization. Used by /dashboard which
// returns raw rows from several tables.
function camelizeRow(row) {
  if (row == null || typeof row !== 'object') return row;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  );
}

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

    // Process activity (camelize so the client doesn't need to handle snake_case)
    const lastActivity = activityResult.rows[0] ? camelizeRow(activityResult.rows[0]) : null;
    let inactivityMinutes = null;
    let inactivityStatus = 'unknown';
    if (lastActivity) {
      inactivityMinutes = Math.floor((Date.now() - new Date(lastActivity.recordedAt).getTime()) / 60000);
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
        latest: healthResult.rows.map(camelizeRow),
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
        active: alertsResult.rows.map(camelizeRow),
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

};

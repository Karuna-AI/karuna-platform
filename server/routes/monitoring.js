/**
 * Monitoring routes — Health Data, Medication Adherence, Activity Monitoring,
 * Caregiver Alerts and Check-in Logs.
 *
 * Extracted verbatim from server/careCircle.js. careCircle.js mounts this at
 * the original section position so Express route registration order is
 * unchanged. VITAL_THRESHOLDS / checkVitalThreshold / fireVitalAlertIfAbnormal
 * moved here from the WebSocket section of careCircle.js: they are only used
 * by the health sync route in this module and broadcast via the injected
 * broadcastToCircle.
 */

module.exports = function mountMonitoringRoutes(router, deps) {
const { db, authMiddleware, requireConsent, broadcastToCircle } = deps;

// ============================================================================
// Health Data Routes (Caregiver Dashboard)
// ============================================================================

// Get health data for a circle
router.get('/circles/:circleId/health', authMiddleware, requireConsent('health_data'), async (req, res) => {
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
router.post('/circles/:circleId/health', authMiddleware, requireConsent('health_data'), async (req, res) => {
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

    // Physiological bounds for health data validation. Keys MUST match validDataTypes
    // entries. blood_pressure has nested systolic/diastolic bounds because its value
    // is an object {systolic, diastolic}.
    const HEALTH_RANGES = {
      heart_rate:        { min: 20, max: 300 },
      blood_pressure:    { systolic: { min: 50, max: 300 }, diastolic: { min: 20, max: 200 } },
      blood_glucose:     { min: 20, max: 600 },
      weight:            { min: 10, max: 500 },
      temperature:       { min: 30, max: 45 },
      oxygen_saturation: { min: 50, max: 100 },
      steps:             { min: 0, max: 200000 },
    };

    const validDataTypes = ['heart_rate', 'blood_pressure', 'blood_glucose', 'weight', 'temperature', 'oxygen_saturation', 'steps'];

    let inserted = 0;
    const skipped = [];
    for (const reading of readings) {
      if (!reading.dataType || !validDataTypes.includes(reading.dataType)) {
        skipped.push({ reading, reason: 'invalid_data_type' });
        continue;
      }

      // Validate numeric values against physiological bounds. Composite types
      // (blood_pressure) check both sub-components; scalar types check the lone value.
      const range = HEALTH_RANGES[reading.dataType];
      const rawValue = reading.value;
      let outOfRange = false;
      if (range) {
        if (reading.dataType === 'blood_pressure' && typeof rawValue === 'object' && rawValue !== null) {
          const sys = rawValue.systolic, dia = rawValue.diastolic;
          if (typeof sys === 'number' && (sys < range.systolic.min || sys > range.systolic.max)) outOfRange = true;
          if (typeof dia === 'number' && (dia < range.diastolic.min || dia > range.diastolic.max)) outOfRange = true;
        } else {
          const scalar = typeof rawValue === 'object' ? rawValue?.value : rawValue;
          if (typeof scalar === 'number' && (scalar < range.min || scalar > range.max)) outOfRange = true;
        }
      }
      if (outOfRange) {
        skipped.push({ reading, reason: 'out_of_range' });
        continue;
      }

      await db.query(
        `INSERT INTO health_data (circle_id, data_type, value, unit, measured_at, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [circleId, reading.dataType, JSON.stringify(reading.value), reading.unit, reading.measuredAt, reading.source || 'device', reading.notes]
      );
      inserted++;

      try {
        // Pass full value (object or scalar). checkVitalThreshold dispatches per dataType.
        await checkVitalThreshold(circleId, reading.dataType, rawValue, reading.unit);
      } catch (thresholdErr) {
        console.error('Vital threshold check failed:', thresholdErr);
      }
    }

    // Broadcast to caregivers
    broadcastToCircle(circleId, { type: 'health_update', count: inserted });

    res.json({ success: true, inserted, skipped: skipped.length > 0 ? skipped : undefined });
  } catch (error) {
    console.error('Sync health data error:', error);
    res.status(500).json({ error: 'Failed to sync health data' });
  }
});

// ============================================================================
// Medication Adherence Routes
// ============================================================================

// Get medication adherence data
router.get('/circles/:circleId/adherence', authMiddleware, requireConsent('health_data'), async (req, res) => {
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
router.post('/circles/:circleId/adherence', authMiddleware, requireConsent('health_data'), async (req, res) => {
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
router.get('/circles/:circleId/checkins', authMiddleware, requireConsent('health_data'), async (req, res) => {
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
router.post('/circles/:circleId/checkins', authMiddleware, requireConsent('health_data'), async (req, res) => {
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

// Vital-threshold alerting (moved from the WebSocket section of careCircle.js;
// only POST /circles/:circleId/health above uses it).
// Keys MUST match the dataType values accepted by POST /circles/:id/health
// (heart_rate, blood_pressure, blood_glucose, weight, temperature, oxygen_saturation, steps).
// Composite types (blood_pressure) carry nested systolic/diastolic thresholds; each
// component fires its own alert when out of range.
const VITAL_THRESHOLDS = {
  heart_rate:        { low: 50, high: 110, unit: 'bpm',   lowSeverity: 'high',     highSeverity: 'high' },
  blood_pressure:    {
    unit: 'mmHg',
    systolic:  { low: 85, high: 140, lowSeverity: 'high',   highSeverity: 'high' },
    diastolic: { low: 55, high: 95,  lowSeverity: 'medium', highSeverity: 'medium' },
  },
  temperature:       { low: 35.5, high: 38.5, unit: '°C',   lowSeverity: 'medium',  highSeverity: 'high' },
  blood_glucose:     { low: 60,   high: 180,  unit: 'mg/dL', lowSeverity: 'high',    highSeverity: 'medium' },
  oxygen_saturation: { low: 90,   high: null, unit: '%',    lowSeverity: 'critical', highSeverity: null },
  weight:            { low: null, high: null, unit: 'kg',   lowSeverity: null,      highSeverity: null },
};

async function checkVitalThreshold(circleId, dataType, value, unit) {
  const threshold = VITAL_THRESHOLDS[dataType];
  if (!threshold) return;

  // Composite types: dispatch per component.
  if (dataType === 'blood_pressure' && typeof value === 'object' && value !== null) {
    const unitToUse = unit || threshold.unit;
    if (typeof value.systolic === 'number') {
      await fireVitalAlertIfAbnormal(circleId, dataType, 'systolic', value.systolic, unitToUse, threshold.systolic);
    }
    if (typeof value.diastolic === 'number') {
      await fireVitalAlertIfAbnormal(circleId, dataType, 'diastolic', value.diastolic, unitToUse, threshold.diastolic);
    }
    return;
  }

  // Scalar types: unwrap {value} envelope or accept raw number.
  const numValue = typeof value === 'object' && value !== null ? value.value : value;
  if (typeof numValue !== 'number') return;
  await fireVitalAlertIfAbnormal(circleId, dataType, null, numValue, unit || threshold.unit, threshold);
}

async function fireVitalAlertIfAbnormal(circleId, dataType, component, numValue, unit, threshold) {
  let severity = null;
  let direction = null;
  if (threshold.low != null && numValue < threshold.low) {
    severity = threshold.lowSeverity;
    direction = 'low';
  } else if (threshold.high != null && numValue > threshold.high) {
    severity = threshold.highSeverity;
    direction = 'high';
  }
  if (!severity) return;

  const baseLabel = dataType.replace(/_/g, ' ');
  const label = component ? `${baseLabel} (${component})` : baseLabel;
  const title = `Abnormal ${label} detected`;
  const message = direction === 'low'
    ? `${label} of ${numValue} ${unit} is below the safe threshold of ${threshold.low} ${unit}.`
    : `${label} of ${numValue} ${unit} is above the safe threshold of ${threshold.high} ${unit}.`;

  const result = await db.query(
    `INSERT INTO caregiver_alerts (circle_id, alert_type, severity, title, message, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [circleId, 'abnormal_vital', severity, title, message,
     JSON.stringify({ data_type: dataType, component, value: numValue, unit, threshold })]
  );

  broadcastToCircle(circleId, {
    type: 'alert',
    alertType: 'abnormal_vital',
    alertId: result.rows[0].id,
    severity,
    dataType,
    component,
  });
}

};

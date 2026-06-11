/**
 * Notification queue worker.
 *
 * Pushes due rows from notification_queue (admin-created via
 * POST /api/admin/notifications/send) to their recipients:
 *   - WebSocket event {type:'notification', ...} to the relevant circle(s)
 *     ('all' uses the '*' wildcard circle, which fans out to every connected
 *     client on every instance via the realtime adapter)
 *   - email (Resend) for high/urgent USER notifications
 *
 * delivered_at marks the push (exactly once); status stays 'pending' so pull
 * clients (GET /api/care/notifications) still see the notification until it
 * is marked read. Failed deliveries keep delivery_error and are retried each
 * cycle for 24h, then marked 'failed'. Multi-instance safe: each cycle runs
 * under the realtime advisory lock.
 */

const POLL_INTERVAL_MS = 60 * 1000;
const LOCK_TTL_MS = 55 * 1000; // slightly under the interval so the lock rolls over
const BATCH_SIZE = 50;
const RETRY_WINDOW_HOURS = 24;

let deps = null;

function initNotificationWorker(dependencies) {
  deps = dependencies; // { db, broadcast, realtime, resend, fromEmail }
}

async function deliverNotification(n) {
  const { db, broadcast, resend, fromEmail } = deps;
  const event = {
    type: 'notification',
    id: n.id,
    notificationType: n.notification_type,
    title: n.title,
    message: n.message,
    priority: n.priority,
    recipientType: n.recipient_type,
  };

  if (n.recipient_type === 'circle') {
    if (!n.recipient_id) throw new Error('circle notification has no recipient_id');
    broadcast(n.recipient_id, event);
    return;
  }

  if (n.recipient_type === 'user') {
    if (!n.recipient_id) throw new Error('user notification has no recipient_id');
    const circles = await db.query(
      'SELECT circle_id FROM circle_members WHERE user_id = $1',
      [n.recipient_id]
    );
    for (const row of circles.rows) {
      broadcast(row.circle_id, { ...event, recipientUserId: n.recipient_id });
    }
    if ((n.priority === 'high' || n.priority === 'urgent') && resend) {
      const user = await db.query('SELECT email, name FROM users WHERE id = $1', [n.recipient_id]);
      if (user.rows.length > 0) {
        await resend.emails.send({
          from: fromEmail,
          to: user.rows[0].email,
          subject: `Karuna: ${n.title}`,
          text: `Hi ${user.rows[0].name},\n\n${n.message}\n\n— The Karuna team`,
        });
      }
    }
    return;
  }

  // 'all' — wildcard circle reaches every connected client on every instance.
  broadcast('*', event);
}

/**
 * One processing cycle. Exported for tests; in production it runs on an
 * interval gated by the cross-instance advisory lock.
 */
async function processNotificationQueue({ skipLock = false } = {}) {
  if (!deps) return { processed: 0 };
  const { db, realtime } = deps;

  if (!skipLock && !(await realtime.acquireJobLock('notification-queue', LOCK_TTL_MS))) {
    return { processed: 0 };
  }

  const due = await db.query(
    `SELECT * FROM notification_queue
     WHERE status = 'pending' AND delivered_at IS NULL
       AND (scheduled_at IS NULL OR scheduled_at <= NOW())
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let delivered = 0;
  for (const n of due.rows) {
    try {
      await deliverNotification(n);
      await db.query(
        'UPDATE notification_queue SET delivered_at = NOW(), delivery_error = NULL WHERE id = $1',
        [n.id]
      );
      delivered++;
    } catch (error) {
      console.error(`[Notifications] Delivery failed for ${n.id}:`, error.message);
      // Keep retrying within the window; give up after RETRY_WINDOW_HOURS.
      await db.query(
        `UPDATE notification_queue
           SET delivery_error = $2,
               status = CASE WHEN created_at < NOW() - ($3 || ' hours')::interval
                             THEN 'failed' ELSE status END
         WHERE id = $1`,
        [n.id, String(error.message).slice(0, 500), RETRY_WINDOW_HOURS]
      ).catch(() => {});
    }
  }

  if (delivered > 0) console.log(`[Notifications] Pushed ${delivered} notification(s)`);
  return { processed: due.rows.length, delivered };
}

function startNotificationWorker(dependencies) {
  initNotificationWorker(dependencies);
  // Tests drive processNotificationQueue() directly; no timer churn in jest.
  if (process.env.NODE_ENV === 'test') return;
  const timer = setInterval(() => {
    processNotificationQueue().catch((err) =>
      console.error('[Notifications] Worker cycle error:', err.message)
    );
  }, POLL_INTERVAL_MS);
  timer.unref();
  console.log('[Notifications] Queue worker started (60s cycle)');
}

module.exports = {
  startNotificationWorker,
  initNotificationWorker,
  processNotificationQueue,
};

/**
 * Optional Redis-backed realtime adapter for multi-instance deployments.
 *
 * When REDIS_URL is set (and ioredis is installed), this module provides:
 *   - cross-instance circle broadcasts (pub/sub) so a caregiver connected to
 *     node A still receives alerts emitted on node B,
 *   - a shared WebSocket-ticket store so a ticket issued on node A works when
 *     the upgrade lands on node B,
 *   - an advisory lock so periodic jobs (archival) run on one instance only.
 *
 * Without REDIS_URL every function degrades to single-instance in-memory
 * behavior — identical to the pre-Redis gateway. See
 * docs/KNOWN_LIMITATIONS_2026-05-31.md item 1.
 */

const crypto = require('crypto');

const INSTANCE_ID = crypto.randomBytes(8).toString('hex');
const CHANNEL = 'karuna:circle-events';
const TICKET_PREFIX = 'karuna:ws-ticket:';
const LOCK_PREFIX = 'karuna:lock:';

// Atomic GET+DEL that works on any Redis version (GETDEL needs 6.2+).
const CONSUME_LUA = "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v";

let pub = null;
let sub = null;
let redisReady = false;
let deliverLocal = null;

function isRedisEnabled() {
  return redisReady;
}

/**
 * Wire up the adapter. `deliverFn(circleId, event)` delivers an event to the
 * WebSocket clients connected to THIS instance; it is invoked for events
 * published by other instances. Safe to call when REDIS_URL is unset (no-op).
 */
function init(deliverFn) {
  deliverLocal = deliverFn;
  const url = process.env.REDIS_URL;
  if (!url) return;

  let Redis;
  try {
    Redis = require('ioredis');
  } catch {
    console.warn('[Realtime] REDIS_URL is set but ioredis is not installed — running single-instance');
    return;
  }

  const opts = { maxRetriesPerRequest: 2, enableOfflineQueue: false };
  pub = new Redis(url, opts);
  sub = new Redis(url, opts);

  // ioredis emits 'error' events; unhandled they crash the process.
  const onError = (which) => (err) => {
    if (redisReady) console.error(`[Realtime] Redis ${which} error:`, err.message);
    redisReady = false;
  };
  pub.on('error', onError('pub'));
  sub.on('error', onError('sub'));
  pub.on('ready', () => {
    redisReady = true;
    console.log(`[Realtime] Redis connected — cross-instance broadcast enabled (instance ${INSTANCE_ID})`);
  });

  // Subscribe on 'ready' (not immediately): with enableOfflineQueue=false a
  // subscribe before the connection is up fails permanently. 'ready' re-fires
  // on every reconnect, and re-subscribing is idempotent.
  sub.on('ready', () => {
    sub.subscribe(CHANNEL).catch((err) => {
      console.error('[Realtime] Redis subscribe failed:', err.message);
    });
  });
  sub.on('message', (channel, raw) => {
    if (channel !== CHANNEL) return;
    try {
      const msg = JSON.parse(raw);
      // The originating instance already delivered to its own clients.
      if (msg.src === INSTANCE_ID) return;
      if (deliverLocal && msg.circleId && msg.event) deliverLocal(msg.circleId, msg.event);
    } catch (err) {
      console.warn('[Realtime] Bad pub/sub payload:', err.message);
    }
  });
}

/** Fan a circle event out to other instances. No-op without Redis. */
function publishCircleEvent(circleId, event) {
  if (!redisReady || !pub) return;
  pub
    .publish(CHANNEL, JSON.stringify({ src: INSTANCE_ID, circleId, event }))
    .catch((err) => console.warn('[Realtime] publish failed:', err.message));
}

/**
 * Store a single-use WS ticket. Returns true when stored in Redis (shared);
 * false means the caller must use its in-memory fallback.
 */
async function storeTicket(ticket, userId, ttlMs) {
  if (!redisReady || !pub) return false;
  try {
    await pub.set(TICKET_PREFIX + ticket, userId, 'PX', ttlMs);
    return true;
  } catch (err) {
    console.warn('[Realtime] ticket store failed:', err.message);
    return false;
  }
}

/**
 * Atomically consume a ticket from the shared store. Returns the userId,
 * or null when the ticket is unknown/expired, or undefined when Redis is
 * unavailable (caller should fall back to its in-memory store).
 */
async function consumeTicket(ticket) {
  if (!redisReady || !pub) return undefined;
  try {
    const userId = await pub.eval(CONSUME_LUA, 1, TICKET_PREFIX + ticket);
    return userId || null;
  } catch (err) {
    console.warn('[Realtime] ticket consume failed:', err.message);
    return undefined;
  }
}

/**
 * Best-effort advisory lock for periodic jobs. Returns true when this
 * instance holds the lock (or when Redis is unavailable — single instance is
 * then assumed, matching pre-Redis behavior).
 */
async function acquireJobLock(name, ttlMs) {
  if (!redisReady || !pub) return true;
  try {
    const ok = await pub.set(LOCK_PREFIX + name, INSTANCE_ID, 'PX', ttlMs, 'NX');
    return ok === 'OK';
  } catch (err) {
    console.warn('[Realtime] lock acquire failed:', err.message);
    return true;
  }
}

/** Close Redis connections (graceful shutdown / tests). */
async function close() {
  redisReady = false;
  await Promise.allSettled([pub?.quit(), sub?.quit()]);
  pub = null;
  sub = null;
}

module.exports = {
  init,
  isRedisEnabled,
  publishCircleEvent,
  storeTicket,
  consumeTicket,
  acquireJobLock,
  close,
  INSTANCE_ID,
};

/**
 * PostgreSQL Database Connection Module
 * Handles connection pooling and query execution
 */

const { Pool } = require('pg');

// Validate required database configuration
if (!process.env.DB_PASSWORD) {
  console.error('ERROR: DB_PASSWORD environment variable is required');
  process.exit(1);
}

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5437'),
  database: process.env.DB_NAME || 'karuna',
  user: process.env.DB_USER || 'karuna',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(config);

// Log connection events
pool.on('connect', () => {
  console.log('[DB] New client connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

/**
 * Execute a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DB_LOG_QUERIES === 'true') {
      console.log('[DB] Query executed:', { text: text.substring(0, 100), duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('[DB] Query error:', { text: text.substring(0, 100), error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  // Timeout for releasing client
  const timeout = setTimeout(() => {
    console.error('[DB] Client has been checked out for more than 5 seconds!');
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    return originalRelease();
  };

  return client;
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connection
 */
async function checkConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('[DB] Database connected at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[DB] Database connection failed:', error.message);
    return false;
  }
}

/**
 * Close all connections
 */
async function close() {
  await pool.end();
  console.log('[DB] All database connections closed');
}

module.exports = {
  query,
  getClient,
  transaction,
  checkConnection,
  close,
  pool,
};

/**
 * Database migration runner.
 *
 * Scans server/db/migrations/*.sql in filename order, skipping any already
 * recorded in the schema_migrations table, and applies the rest in a
 * transaction. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node server/db/migrations/run.js
 *
 * Required env: DATABASE_URL  -or-  DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5437'),
      database: process.env.DB_NAME || 'karuna',
      user: process.env.DB_USER || 'karuna',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(dbConfig);

async function run() {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          SERIAL PRIMARY KEY,
        filename    TEXT NOT NULL UNIQUE,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Collect applied migrations
    const appliedResult = await client.query('SELECT filename FROM schema_migrations ORDER BY filename');
    const applied = new Set(appliedResult.rows.map((r) => r.filename));

    // Collect all .sql migration files sorted by name
    const migrationsDir = __dirname;
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrations] No pending migrations. Database is up to date.');
      return;
    }

    console.log(`[migrations] ${pending.length} pending migration(s): ${pending.join(', ')}`);

    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      console.log(`[migrations] Applying ${filename}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`[migrations] ✓ ${filename} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrations] ✗ ${filename} failed: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log('[migrations] All migrations applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrations] Fatal error:', err.message);
  process.exitCode = 1;
});

/**
 * Database Initialization Script
 * Run this to set up the production database schema
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable or argument required');
  console.error('Usage: node init-db.js <postgresql://...>');
  process.exit(1);
}

async function initDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    console.log('Connected successfully!');

    // Read and execute init.sql
    const initSqlPath = path.join(__dirname, '..', 'db', 'init.sql');
    console.log(`\nExecuting ${initSqlPath}...`);
    const initSql = fs.readFileSync(initSqlPath, 'utf8');
    await client.query(initSql);
    console.log('Main schema created successfully!');

    // Read and execute admin_tables.sql
    const adminSqlPath = path.join(__dirname, '..', 'db', 'admin_tables.sql');
    console.log(`\nExecuting ${adminSqlPath}...`);
    const adminSql = fs.readFileSync(adminSqlPath, 'utf8');
    await client.query(adminSql);
    console.log('Admin tables created successfully!');

    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nCreated tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    client.release();
    console.log('\nDatabase initialization complete!');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    if (error.position) {
      console.error('Error position:', error.position);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();

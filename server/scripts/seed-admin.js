#!/usr/bin/env node
/**
 * Admin User Seed Script
 *
 * Creates an initial super_admin user for the Karuna Admin Portal.
 *
 * Usage:
 *   node scripts/seed-admin.js --password <your-secure-password>
 *   node scripts/seed-admin.js -e admin@example.com -p <password> -n "Admin Name"
 *
 * Environment variables required:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   ADMIN_PASSWORD (optional - admin password, or use --password flag)
 *
 * Or use a .env file in the server directory.
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');

const BCRYPT_ROUNDS = 12;

// Default admin credentials
const DEFAULT_EMAIL = 'admin@karuna.com';
const DEFAULT_NAME = 'System Admin';

// Generate a random password if none provided (for development only)
function generateRandomPassword() {
  return crypto.randomBytes(12).toString('base64').slice(0, 16);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    email: DEFAULT_EMAIL,
    password: process.env.ADMIN_PASSWORD || null, // Will be set via CLI or generated
    name: DEFAULT_NAME,
    role: 'super_admin',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--email':
      case '-e':
        options.email = args[++i];
        break;
      case '--password':
      case '-p':
        options.password = args[++i];
        break;
      case '--name':
      case '-n':
        options.name = args[++i];
        break;
      case '--role':
      case '-r':
        options.role = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Admin User Seed Script
======================

Creates an initial admin user for the Karuna Admin Portal.

Usage:
  node scripts/seed-admin.js [options]

Options:
  -e, --email <email>       Admin email (default: ${DEFAULT_EMAIL})
  -p, --password <password> Admin password (required for production, auto-generated for dev)
  -n, --name <name>         Admin name (default: ${DEFAULT_NAME})
  -r, --role <role>         Admin role: super_admin, admin, support (default: super_admin)
  -h, --help                Show this help message

Environment Variables:
  DB_HOST        PostgreSQL host (default: localhost)
  DB_PORT        PostgreSQL port (default: 5432)
  DB_NAME        Database name (default: karuna)
  DB_USER        Database user
  DB_PASSWORD    Database password
  ADMIN_PASSWORD Admin password (alternative to --password flag)

Examples:
  # Create admin with generated password (development)
  node scripts/seed-admin.js

  # Create admin with specific password
  node scripts/seed-admin.js --password <your-secure-password>

  # Create custom admin
  node scripts/seed-admin.js -e admin@example.com -p <password> -n "Admin Name"

  # Create support user
  node scripts/seed-admin.js -e support@example.com -p <password> -n "Support Staff" -r support
`);
}

async function seedAdmin() {
  const options = parseArgs();

  // Validate role
  const validRoles = ['super_admin', 'admin', 'support'];
  if (!validRoles.includes(options.role)) {
    console.error(`Error: Invalid role "${options.role}". Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  // Generate password if not provided
  let generatedPassword = false;
  if (!options.password) {
    options.password = generateRandomPassword();
    generatedPassword = true;
    console.log('Note: No password provided. Generating random password for development.');
    console.log('For production, use --password flag or ADMIN_PASSWORD environment variable.\n');
  }

  // Check for required environment variables
  if (!process.env.DB_PASSWORD && !process.env.DATABASE_URL) {
    console.error('Error: Database credentials not configured.');
    console.error('Set DB_PASSWORD environment variable or create a .env file.');
    console.error('Run with --help for more information.');
    process.exit(1);
  }

  // Create database connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'karuna',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Connecting to database...');

    // Test connection
    await pool.query('SELECT 1');
    console.log('Database connected successfully.');

    // Check if admin_users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'admin_users'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('Error: admin_users table does not exist.');
      console.error('Run the admin_tables.sql migration first:');
      console.error('  psql -d karuna -f db/admin_tables.sql');
      process.exit(1);
    }

    // Check if admin already exists
    const existingAdmin = await pool.query(
      'SELECT id, email, role FROM admin_users WHERE email = $1',
      [options.email.toLowerCase()]
    );

    if (existingAdmin.rows.length > 0) {
      console.log(`\nAdmin user already exists: ${options.email}`);
      console.log(`Role: ${existingAdmin.rows[0].role}`);
      console.log(`ID: ${existingAdmin.rows[0].id}`);

      // Ask if user wants to update password
      console.log('\nTo update the password, use the --password flag with a new password.');
      console.log('Updating password...');

      const passwordHash = await bcrypt.hash(options.password, BCRYPT_ROUNDS);
      await pool.query(
        'UPDATE admin_users SET password_hash = $1, name = $2, role = $3, updated_at = CURRENT_TIMESTAMP WHERE email = $4',
        [passwordHash, options.name, options.role, options.email.toLowerCase()]
      );

      console.log('Password updated successfully!');
    } else {
      // Create new admin user
      console.log(`\nCreating admin user...`);
      console.log(`  Email: ${options.email}`);
      console.log(`  Name: ${options.name}`);
      console.log(`  Role: ${options.role}`);

      const passwordHash = await bcrypt.hash(options.password, BCRYPT_ROUNDS);

      const result = await pool.query(
        `INSERT INTO admin_users (email, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, created_at`,
        [options.email.toLowerCase(), passwordHash, options.name, options.role]
      );

      const admin = result.rows[0];
      console.log('\nAdmin user created successfully!');
      console.log(`  ID: ${admin.id}`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Name: ${admin.name}`);
      console.log(`  Role: ${admin.role}`);
      console.log(`  Created: ${admin.created_at}`);
    }

    console.log('\n----------------------------------------');
    console.log('Login credentials:');
    console.log(`  Email: ${options.email}`);
    console.log(`  Password: ${options.password}`);
    console.log('----------------------------------------');
    console.log('\nYou can now login at: http://localhost:3040/login');

  } catch (error) {
    console.error('\nError:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error('\nCould not connect to database. Make sure PostgreSQL is running.');
    } else if (error.code === '28P01') {
      console.error('\nDatabase authentication failed. Check DB_USER and DB_PASSWORD.');
    } else if (error.code === '3D000') {
      console.error('\nDatabase does not exist. Create it first:');
      console.error('  createdb karuna');
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
seedAdmin();

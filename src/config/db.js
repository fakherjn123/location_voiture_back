const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'location_voiture',
  password: process.env.DB_PASSWORD || '29154698',
  port: process.env.DB_PORT || 5432,
});

// Auto-migration: add 'archived' column if it doesn't exist
pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`)
  .then(() => console.log('✅ Migration: archived column OK'))
  .catch(err => console.error('Migration error:', err.message));

// Auto-migration: add 'refund_status' column to payments
pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT NULL`)
  .then(() => console.log('✅ Migration: refund_status column OK'))
  .catch(err => console.error('Migration refund error:', err.message));


module.exports = pool;
// Trigger restart

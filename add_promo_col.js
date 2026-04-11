const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'PFE',
  password: '29154698',
  port: 5432,
});

async function run() {
  try {
    await pool.query(`ALTER TABLE cars ADD COLUMN IF NOT EXISTS promotion_price NUMERIC(10,2) DEFAULT NULL`);
    console.log("SUCCESS: Added promotion_price column to cars table");
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit(0);
  }
}

run();

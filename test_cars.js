const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'PFE',
  password: '29154698',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cars'`);
    fs.writeFileSync('schema_cars.json', JSON.stringify(res.rows, null, 2));
    console.log('Done writing schema_cars.json');
  } catch (err) {
    console.error('ERROR:', err.message);
  }
  process.exit(0);
}
run();

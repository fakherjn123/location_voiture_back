const pool = require('./src/config/db');

async function migrate() {
  try {
    await pool.query("ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(10);");
    console.log("Column delivery_time added successfully.");
  } catch (e) {
    console.error("Migration error:", e.message);
  } finally {
    process.exit(0);
  }
}

migrate();

const pool = require("./src/config/db");
const fs = require("fs");

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'rentals';
    `);
    fs.writeFileSync("db_columns.json", JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (err) {
    fs.writeFileSync("db_columns.json", JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}
checkSchema();

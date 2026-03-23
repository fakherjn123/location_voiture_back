const pool = require("./src/config/db");

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'rentals';
    `);
    console.log("COLUMNS IN rentals:");
    res.rows.forEach(r => console.log(`- ${r.column_name} (${r.data_type})`));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
checkSchema();

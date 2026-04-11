const pool = require("./db");
const fs = require("fs");
const path = require("path");

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, "add_premium_features.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log("Executing migration...");
    await pool.query(sql);
    console.log("Migration executed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error.message);
    process.exit(1);
  }
}

runMigration();

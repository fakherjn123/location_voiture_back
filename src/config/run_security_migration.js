require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require("./db");
const fs = require("fs");
const path = require("path");

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, "security_features.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log("Executing strict security features migration...");
    await pool.query(sql);
    console.log("Migration executed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error.message);
    process.exit(1);
  }
}

runMigration();

const pool = require("./src/config/db");

async function migrate() {
  try {
    console.log("Migration en cours...");
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    console.log("Colonne 'phone' ajoutée ou déjà existante.");
    
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;`);
    console.log("Colonne 'birth_date' ajoutée ou déjà existante.");

    console.log("✨ Migration terminée avec succès !");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur pendant la migration :", error);
    process.exit(1);
  }
}

migrate();

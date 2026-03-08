const pool = require('./src/config/db');
const fs = require('fs');
const path = require('path');

const runMigration = async () => {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'src/config/add_hero_images.sql'), 'utf8');
        await pool.query(sql);
        console.log('Migration successful: hero_images table created.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
};

runMigration();

const pool = require('./src/config/db');

const createContactsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'non lu',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Contacts table created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating contacts table:", err);
        process.exit(1);
    }
};

createContactsTable();

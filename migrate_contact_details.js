const pool = require("./src/config/db");

const createContactDetailsTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contact_details (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                label VARCHAR(255) NOT NULL,
                value TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("contact_details table created successfully.");

        // Check if data already exists
        const countRes = await pool.query('SELECT COUNT(*) FROM contact_details');
        if (parseInt(countRes.rows[0].count, 10) === 0) {
            console.log("Seeding initial contact details...");
            await pool.query(`
                INSERT INTO contact_details (type, label, value) VALUES
                ('address', 'Adresse Siège', 'Avenue du Japon, Tunis'),
                ('whatsapp', 'WhatsApp France', '+33 7 45 18 45 64'),
                ('phone', 'Téléphone', '+216 22 30 30 40'),
                ('phone', 'Téléphone', '+216 29 56 14 00'),
                ('description', 'Agence', 'BmZ Rent a Car est une agence de location de voiture qui propose à ses clients la location de voitures pas chères dans tout le territoire tunisien.'),
                ('email', 'Service commercial', 'yoursrentcar@topnet.tn');
            `);
            console.log("Initial contact details seeded.");
        } else {
            console.log("Values already seeded.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error creating contact_details table:", err);
        process.exit(1);
    }
};

createContactDetailsTable();

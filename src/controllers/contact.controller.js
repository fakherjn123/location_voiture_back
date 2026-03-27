const pool = require("../config/db");

// PUBLIC: Submit a contact message
exports.submitContact = async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ message: "Veuillez remplir tous les champs obligatoires." });
        }

        const result = await pool.query(
            `INSERT INTO contacts (name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, subject, status, created_at`,
            [name, email, phone || null, subject, message]
        );

        res.status(201).json({ 
            message: "Votre message a été envoyé avec succès.", 
            data: result.rows[0] 
        });
    } catch (err) {
        console.error("SUBMIT CONTACT ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Get all contacts
exports.getContacts = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM contacts ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("GET CONTACTS ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Update contact status
exports.updateContactStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // e.g. 'lu', 'non lu', 'archivé'
        
        const result = await pool.query(
            `UPDATE contacts SET status = $1 WHERE id = $2 RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Message introuvable." });
        }

        res.json({ message: "Statut mis à jour.", data: result.rows[0] });
    } catch (err) {
        console.error("UPDATE CONTACT STATUS ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Delete a contact message
exports.deleteContact = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `DELETE FROM contacts WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Message introuvable." });
        }

        res.json({ message: "Message supprimé avec succès." });
    } catch (err) {
        console.error("DELETE CONTACT ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// --- CONTACT DETAILS (CMS) ---

// PUBLIC: Get all contact details
exports.getContactDetails = async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM contact_details ORDER BY id ASC`);
        res.json(result.rows);
    } catch (err) {
        console.error("GET CONTACT DETAILS ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Add a new contact detail
exports.addContactDetail = async (req, res) => {
    try {
        const { type, label, value } = req.body;
        if (!type || !label || !value) {
            return res.status(400).json({ message: "Veuillez fournir un type, un label et une valeur." });
        }
        const result = await pool.query(
            `INSERT INTO contact_details (type, label, value) VALUES ($1, $2, $3) RETURNING *`,
            [type, label, value]
        );
        res.status(201).json({ message: "Détail ajouté.", data: result.rows[0] });
    } catch (err) {
        console.error("ADD CONTACT DETAIL ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Update a contact detail
exports.updateContactDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, label, value } = req.body;
        const result = await pool.query(
            `UPDATE contact_details SET type = COALESCE($1, type), label = COALESCE($2, label), value = COALESCE($3, value) WHERE id = $4 RETURNING *`,
            [type, label, value, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Introuvable." });
        res.json({ message: "Détail mis à jour.", data: result.rows[0] });
    } catch (err) {
        console.error("UPDATE CONTACT DETAIL ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

// ADMIN: Delete a contact detail
exports.deleteContactDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`DELETE FROM contact_details WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Introuvable." });
        res.json({ message: "Détail supprimé avec succès." });
    } catch (err) {
        console.error("DELETE CONTACT DETAIL ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

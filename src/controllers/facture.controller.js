const pool = require("../config/db");

/**
 * 🧾 CREATE INVOICE (after rental)
 */
exports.createFacture = async (req, res) => {
  try {
    const { rental_id, total } = req.body;

    if (!rental_id || !total) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const invoice = await pool.query(
      `INSERT INTO facture (user_id, rental_id, total)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, rental_id, total]
    );

    res.status(201).json(invoice.rows[0]);
  } catch (error) {
    console.error("CREATE INVOICE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur facture" });
  }
};

/**
 * 📄 GET MY facture
 */
exports.getMyFacture = async (req, res) => {
  try {
    const facture = await pool.query(
      `SELECT * FROM facture WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(facture.rows);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * 📊 ADMIN – ALL facture
 */
exports.getAllFacture = async (req, res) => {
  try {
    const facture = await pool.query(
      `SELECT facture.*, users.email
       FROM facture
       JOIN users ON users.id = facture.user_id
       ORDER BY created_at DESC`
    );

    res.json(facture.rows);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
};

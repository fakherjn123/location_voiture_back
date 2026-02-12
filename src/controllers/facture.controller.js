const pool = require("../config/db");
const generatePDF = require("../utils/generateFacturePDF");
const path = require("path");
/**
 * 📄 TÉLÉCHARGER MA FACTURE PDF
 */
exports.downloadFacturePDF = async (req, res) => {
  try {
    const { id } = req.params;

    let query;
    let values;

    // 👑 ADMIN peut voir toutes les factures
    if (req.user.role === "admin") {
      query = `
        SELECT f.*, u.email, c.brand, c.model, r.start_date, r.end_date
        FROM facture f
        JOIN users u ON u.id = f.user_id
        JOIN rentals r ON r.id = f.rental_id
        JOIN cars c ON c.id = r.car_id
        WHERE f.id = $1
      `;
      values = [id];
    } 
    // 👤 CLIENT voit seulement sa facture
    else {
      query = `
        SELECT f.*, u.email, c.brand, c.model, r.start_date, r.end_date
        FROM facture f
        JOIN users u ON u.id = f.user_id
        JOIN rentals r ON r.id = f.rental_id
        JOIN cars c ON c.id = r.car_id
        WHERE f.id = $1 AND f.user_id = $2
      `;
      values = [id, req.user.id];
    }

    const facture = await pool.query(query, values);

    if (facture.rows.length === 0) {
      return res.status(404).json({ message: "Facture introuvable" });
    }

    res.json(facture.rows[0]);

  } catch (error) {
    console.error("DOWNLOAD FACTURE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * 📄 GET MY FACTURES (CLIENT)
 * Factures générées automatiquement après location terminée
 */
exports.getMyFacture = async (req, res) => {
  try {
    const factures = await pool.query(
      `
      SELECT 
        f.id,
        f.total,
        f.created_at,
        r.start_date,
        r.end_date,
        r.status,
        c.brand,
        c.model
      FROM facture f
      JOIN rentals r ON r.id = f.rental_id
      JOIN cars c ON c.id = r.car_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      `,
      [req.user.id]
    );

    res.status(200).json({
      count: factures.rows.length,
      factures: factures.rows
    });
  } catch (error) {
    console.error("GET MY FACTURE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * 📊 GET ALL FACTURES (ADMIN)
 */
exports.getAllFacture = async (req, res) => {
  try {
    const factures = await pool.query(
      `
      SELECT 
        f.id,
        f.total,
        f.created_at,
        u.email,
        r.start_date,
        r.end_date,
        r.status,
        c.brand,
        c.model
      FROM facture f
      JOIN users u ON u.id = f.user_id
      JOIN rentals r ON r.id = f.rental_id
      JOIN cars c ON c.id = r.car_id
      ORDER BY f.created_at DESC
      `
    );

    res.status(200).json({
      count: factures.rows.length,
      factures: factures.rows
    });
  } catch (error) {
    console.error("GET ALL FACTURE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

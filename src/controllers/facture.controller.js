const pool = require("../config/db");
const { generateFacture } = require("../utils/generateFacturePDF");
const fs = require("fs");

/**
 * 📄 TÉLÉCHARGER MA FACTURE PDF
 */
exports.downloadFacturePDF = async (req, res) => {
  try {
    const { id } = req.params;

    let query;
    let values;

    if (req.user.role === "admin") {
      query = `
        SELECT f.*, u.email, r.start_date, r.end_date, c.brand, c.model
        FROM facture f
        JOIN users u ON u.id = f.user_id
        JOIN rentals r ON r.id = f.rental_id
        JOIN cars c ON c.id = r.car_id
        WHERE f.id = $1
      `;
      values = [id];
    } else {
      query = `
        SELECT f.*, u.email, r.start_date, r.end_date, c.brand, c.model
        FROM facture f
        JOIN users u ON u.id = f.user_id
        JOIN rentals r ON r.id = f.rental_id
        JOIN cars c ON c.id = r.car_id
        WHERE f.id = $1 AND f.user_id = $2
      `;
      values = [id, req.user.id];
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Facture not found" });
    }

    const facture = result.rows[0];

    const payment = {
      id: facture.id,
      amount: facture.total,
      method: "card"
    };

    const rental = {
      id: facture.rental_id,
      start_date: facture.start_date,
      end_date: facture.end_date
    };

    const user = {
      email: facture.email
    };

    const car = {
      brand: facture.brand,
      model: facture.model
    };

    // 🔥 IMPORTANT FIX
    const filePath = await generateFacture(payment, rental, user, car);

    res.download(filePath, `facture-${facture.id}.pdf`, (err) => {
      if (!err && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // delete after download
      }
    });

  } catch (error) {
    console.error("PDF DOWNLOAD ERROR:", error);
    res.status(500).json({ message: "Server error" });
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

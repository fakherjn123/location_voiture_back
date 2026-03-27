const pool = require("../config/db");
const { generateContract } = require("../utils/generateContractPDF");
const fs = require("fs");


exports.downloadFacturePDF = async (req, res) => {
  try {
    const { id } = req.params;

    let query;
    let values;

    if (req.user.role === "admin") {
      query = `
        SELECT f.*, u.email, u.name, r.start_date, r.end_date, c.brand, c.model
        FROM facture f
        JOIN users u ON u.id = f.user_id
        JOIN rentals r ON r.id = f.rental_id
        JOIN cars c ON c.id = r.car_id
        WHERE f.id = $1
      `;
      values = [id];
    } else {
      query = `
        SELECT f.*, u.email, u.name, r.start_date, r.end_date, c.brand, c.model
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

    // Use the same generateContract as email so admin and client get identical PDF
    const filePath = await generateContract(
      { id: facture.rental_id, start_date: facture.start_date, end_date: facture.end_date, total_price: facture.total },
      { name: facture.name || facture.email, email: facture.email },
      { brand: facture.brand, model: facture.model }
    );

    res.download(filePath, `contrat-${facture.rental_id}.pdf`, (err) => {
      if (!err && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // delete after download
      }
    });

  } catch (error) {
    console.error("PDF DOWNLOAD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

   
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

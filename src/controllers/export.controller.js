const pool = require("../config/db");
const { Parser } = require("json2csv");

exports.exportRentals = async (req, res) => {
  try {
    console.log("Starting CSV Export...");
    const result = await pool.query(`
      SELECT 
        r.id as "ID Réservation",
        u.name as "Client",
        u.email as "Email",
        c.brand as "Marque",
        c.model as "Modèle",
        r.start_date as "Date Début",
        r.end_date as "Date Fin",
        r.total_price as "Total (TND)",
        r.status as "Statut",
        r.promo_code as "Code Promo",
        r.discount_amount as "Remise (TND)",
        r.created_at as "Date Création"
      FROM rentals r
      JOIN users u ON u.id = r.user_id
      JOIN cars c ON c.id = r.car_id
      ORDER BY r.created_at DESC
    `);

    console.log(`Found ${result.rows.length} rentals to export.`);

    if (result.rows.length === 0) {
      // Export empty but with headers
      const fields = ["ID Réservation", "Client", "Email", "Marque", "Modèle", "Date Début", "Date Fin", "Total (TND)", "Statut", "Code Promo", "Remise (TND)", "Date Création"];
      const json2csvParser = new Parser({ fields, delimiter: ';' });
      const csv = json2csvParser.parse([]);
      res.header("Content-Type", "text/csv; charset=utf-8");
      res.attachment("report_empty.csv");
      return res.send('\uFEFF' + csv);
    }

    const json2csvParser = new Parser({ delimiter: ';' });
    const csv = json2csvParser.parse(result.rows);

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment("rapport_locations_" + new Date().toISOString().split('T')[0] + ".csv");
    return res.send('\uFEFF' + csv);

  } catch (error) {
    console.error("EXPORT ERROR DETAILS:", error.message);
    res.status(500).json({ message: "Erreur lors de l'exportation CSV: " + error.message });
  }
};

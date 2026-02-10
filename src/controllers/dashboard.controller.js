const pool = require("../config/db");

/**
 * 📊 DASHBOARD GLOBAL
 * ADMIN ONLY
 */
exports.getStats = async (req, res) => {
  try {
    const cars = await pool.query("SELECT COUNT(*) FROM cars");
    const rentals = await pool.query("SELECT COUNT(*) FROM rentals");
    const revenue = await pool.query(
      "SELECT COALESCE(SUM(total_price), 0) FROM rentals"
    );

    res.json({
      cars: Number(cars.rows[0].count),
      rentals: Number(rentals.rows[0].count),
      revenue: Number(revenue.rows[0].coalesce)
    });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Erreur serveur dashboard" });
  }
};

/**
 * 💰 DASHBOARD FINANCIER
 * ADMIN ONLY
 */
exports.getFinancialStats = async (req, res) => {
  try {
    const cars = await pool.query("SELECT COUNT(*) FROM cars");
    const rentals = await pool.query("SELECT COUNT(*) FROM rentals");
    const payments = await pool.query("SELECT COUNT(*) FROM payments");
    const revenue = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments"
    );

    res.json({
      cars: Number(cars.rows[0].count),
      rentals: Number(rentals.rows[0].count),
      payments: Number(payments.rows[0].count),
      revenue: Number(revenue.rows[0].total)
    });
  } catch (error) {
    console.error("FINANCIAL DASHBOARD ERROR:", error);
    res.status(500).json({
      message: "Erreur serveur dashboard financier"
    });
  }
};

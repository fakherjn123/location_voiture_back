const pool = require("../config/db");

/**
 * 📊 DASHBOARD GLOBAL
 * ADMIN ONLY
 */
exports.getStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM cars) AS total_cars,
        (SELECT COUNT(*) FROM cars WHERE is_active = true) AS active_cars,
        (SELECT COUNT(*) FROM rentals) AS total_rentals,
        (SELECT COUNT(*) FROM rentals WHERE status = 'ongoing') AS ongoing_rentals,
        (SELECT COUNT(*) FROM rentals WHERE status = 'confirmed') AS confirmed_rentals,
        (SELECT COUNT(*) FROM users) AS total_users
    `);

    res.json({
      total_cars: Number(stats.rows[0].total_cars),
      active_cars: Number(stats.rows[0].active_cars),
      total_rentals: Number(stats.rows[0].total_rentals),
      ongoing_rentals: Number(stats.rows[0].ongoing_rentals),
      confirmed_rentals: Number(stats.rows[0].confirmed_rentals),
      total_users: Number(stats.rows[0].total_users),
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

    const financial = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM payments) AS total_payments,
        (SELECT COUNT(*) FROM payments WHERE status = 'paid') AS paid_payments,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'paid') AS total_revenue,
        (SELECT COALESCE(SUM(amount),0)
         FROM payments
         WHERE status = 'paid'
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        ) AS current_month_revenue
    `);

    res.json({
      total_payments: Number(financial.rows[0].total_payments),
      paid_payments: Number(financial.rows[0].paid_payments),
      total_revenue: Number(financial.rows[0].total_revenue),
      current_month_revenue: Number(financial.rows[0].current_month_revenue),
    });

  } catch (error) {
    console.error("FINANCIAL DASHBOARD ERROR:", error);
    res.status(500).json({
      message: "Erreur serveur dashboard financier"
    });
  }
};


/**
 * 🚗 TOP 5 VOITURES LES PLUS LOUÉES
 */
exports.getTopCars = async (req, res) => {
  try {

    const topCars = await pool.query(`
      SELECT cars.id, cars.brand, cars.model,
             COUNT(rentals.id) AS total_rentals
      FROM cars
      LEFT JOIN rentals ON rentals.car_id = cars.id
      GROUP BY cars.id
      ORDER BY total_rentals DESC
      LIMIT 5
    `);

    res.json(topCars.rows);

  } catch (error) {
    console.error("TOP CARS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur top cars" });
  }
};
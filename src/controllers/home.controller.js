const pool = require("../config/db");
const jwt = require("jsonwebtoken");

/**
 * 🏠 HOME PAGE – voitures personnalisées
 */
exports.getHomeCars = async (req, res) => {
  try {
    let userId = null;

    // 🔐 Token facultatif (NE DOIT JAMAIS CASSER)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        // token invalide → visiteur simple
        userId = null;
      }
    }

    // =========================
    // 👤 UTILISATEUR CONNECTÉ
    // =========================
    if (userId) {
      const history = await pool.query(
        `
        SELECT
          cars.brand AS category,
          AVG(rentals.total_price)::numeric AS avg_budget,
          AVG(EXTRACT(DAY FROM (rentals.end_date - rentals.start_date)))::int AS avg_days,
          COUNT(*) AS total
        FROM rentals
        JOIN cars ON cars.id = rentals.car_id
        WHERE rentals.user_id = $1
        GROUP BY cars.brand
        ORDER BY total DESC
        LIMIT 1
        `,
        [userId]
      );

      if (history.rows.length > 0) {
        const { category, avg_budget, avg_days } = history.rows[0];

        const cars = await pool.query(
          `
          SELECT id, brand, model, price_per_day
          FROM cars
          WHERE
            available = true
            AND brand ILIKE $1
            AND price_per_day * $2 <= $3
          ORDER BY price_per_day ASC
          LIMIT 6
          `,
          [`%${category}%`, Math.ceil(avg_days), avg_budget]
        );

        return res.status(200).json({
          mode: "personalized",
          based_on: "user_history",
          cars: cars.rows
        });
      }
    }

    // =========================
    // 👥 VISITEUR / PAS D'HISTORIQUE
    // =========================
    const fallbackCars = await pool.query(
      `
      SELECT id, brand, model, price_per_day
      FROM cars
      WHERE available = true
      ORDER BY price_per_day ASC
      LIMIT 6
      `
    );

    res.status(200).json({
      mode: "generic",
      cars: fallbackCars.rows
    });

  } catch (error) {
    console.error("HOME ERROR:", error);
    res.status(500).json({
      message: "Erreur serveur page d'accueil"
    });
  }
};

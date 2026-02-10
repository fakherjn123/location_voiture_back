const pool = require("../config/db");

/**
 * 🤖 RECOMMENDATION ENGINE (simple IA logique)
 * POST /api/recommendation
 */
exports.getRecommendation = async (req, res) => {
  try {
    const {
      budget,
      brand,
      limit = 5,
      page = 1
    } = req.body;

    if (!budget) {
      return res.status(400).json({
        message: "Budget requis"
      });
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT *
      FROM cars
      WHERE price_per_day <= $1
      ${brand ? "AND brand ILIKE $2" : ""}
      ORDER BY price_per_day ASC
      LIMIT $3 OFFSET $4
    `;

    const values = brand
      ? [budget, `%${brand}%`, limit, offset]
      : [budget, limit, offset];

    const cars = await pool.query(query, values);

    res.json({
      count: cars.rows.length,
      page: Number(page),
      limit: Number(limit),
      recommendations: cars.rows
    });

  } catch (error) {
    console.error("RECOMMENDATION ERROR:", error);
    res.status(500).json({
      message: "Erreur serveur recommendation"
    });
  }
};

const pool = require("../config/db");

/**
 * POST /api/recommendation
 * Body: { budget, days, category? }
 */
exports.getRecommendation = async (req, res) => {
  try {
    let { budget, days, category } = req.body;

    // 🔒 Validation
    if (!budget || !days) {
      return res.status(400).json({
        message: "budget et days sont obligatoires"
      });
    }

    budget = Number(budget);
    days = Number(days);

    if (isNaN(budget) || isNaN(days)) {
      return res.status(400).json({
        message: "budget et days doivent être numériques"
      });
    }

    // 🔍 Récupération voitures
    let query = "SELECT * FROM cars WHERE available = true";
    let params = [];

    if (category) {
      query += " AND brand ILIKE $1";
      params.push(`%${category}%`);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Aucune voiture disponible"
      });
    }

    let bestCar = null;
    let bestScore = -Infinity;

    for (const car of result.rows) {
      const totalPrice = Number(car.price_per_day) * days;

      if (totalPrice <= budget) {
        // score simple (tu peux améliorer)
        const score = budget - totalPrice;

        if (score > bestScore) {
          bestScore = score;
          bestCar = car;
        }
      }
    }

    // ⭐ AMÉLIORATION FACULTATIVE
    // Si aucune voiture dans le budget → proposer la moins chère
    if (!bestCar) {
      const cheapestCar = result.rows.sort(
        (a, b) => Number(a.price_per_day) - Number(b.price_per_day)
      )[0];

      return res.status(200).json({
        message: "Aucune voiture ne correspond à votre budget",
        suggestion: cheapestCar,
        total_price: Number(cheapestCar.price_per_day) * days
      });
    }

    return res.status(200).json({
      recommendation: bestCar,
      total_price: Number(bestCar.price_per_day) * days,
      score: bestScore
    });

  } catch (err) {
    console.error("RECOMMENDATION ERROR:", err);
    return res.status(500).json({
      message: "Erreur serveur"
    });
  }
};

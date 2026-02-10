const pool = require("../config/db");

/**
 * 🚗 RENT A CAR
 * + ⭐ POINTS DE FIDÉLITÉ
 * + ⭐ RÉDUCTION
 * + ⭐ RECOMMANDATION AUTOMATIQUE
 */
exports.rentCar = async (req, res) => {
  try {
    const { car_id, start_date, end_date } = req.body;
    const user_id = req.user.id;

    // 1️⃣ Validation
    if (!car_id || !start_date || !end_date) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (new Date(end_date) <= new Date(start_date)) {
      return res.status(400).json({ message: "Invalid dates" });
    }

    // 2️⃣ Vérifier voiture
    const carResult = await pool.query(
      "SELECT * FROM cars WHERE id = $1",
      [car_id]
    );

    if (carResult.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    const car = carResult.rows[0];

    // 3️⃣ Vérifier conflit de dates
    const conflict = await pool.query(
      `
      SELECT 1 FROM rentals
      WHERE car_id = $1
        AND NOT (
          end_date < $2
          OR start_date > $3
        )
      `,
      [car_id, start_date, end_date]
    );

    if (conflict.rows.length > 0) {
      return res.status(400).json({
        message: "Car not available for selected dates"
      });
    }

    // 4️⃣ Calcul du total
    const days =
      (new Date(end_date) - new Date(start_date)) /
      (1000 * 60 * 60 * 24);

    const baseTotal = days * car.price_per_day;

    // =========================
    // ⭐ POINTS + RÉDUCTION
    // =========================
    const userResult = await pool.query(
      "SELECT points FROM users WHERE id = $1",
      [user_id]
    );

    let userPoints = userResult.rows[0].points || 0;

    let discount = 0;
    let usedPoints = 0;

    if (userPoints >= 100) {
      discount = baseTotal * 0.1; // 10%
      usedPoints = 100;
      userPoints -= usedPoints;
    }

    const finalTotal = baseTotal - discount;

    const pointsEarned = Math.floor(days * 10);
    userPoints += pointsEarned;

    // 5️⃣ Créer la location
    const rental = await pool.query(
      `
      INSERT INTO rentals (user_id, car_id, start_date, end_date, total_price)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [user_id, car_id, start_date, end_date, finalTotal]
    );

    // 6️⃣ Mettre à jour les points utilisateur
    await pool.query(
      "UPDATE users SET points = $1 WHERE id = $2",
      [userPoints, user_id]
    );

    // =========================
    // ⭐ RECOMMANDATION AUTOMATIQUE
    // =========================
    const recommendations = await pool.query(
      `
      SELECT id, brand, model, price_per_day
      FROM cars
      WHERE
        available = true
        AND brand ILIKE $1
        AND price_per_day * $2 <= $3
        AND id != $4
      ORDER BY price_per_day ASC
      LIMIT 3
      `,
      [`%${car.brand}%`, days, finalTotal, car_id]
    );

    // 7️⃣ Réponse finale
    res.status(201).json({
      message: "Car rented successfully",
      base_total: baseTotal,
      discount,
      final_total: finalTotal,
      points_earned: pointsEarned,
      points_remaining: userPoints,
      rental: rental.rows[0],
      recommendations: recommendations.rows
    });

  } catch (error) {
    console.error("RENT CAR ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
  exports.getMyRentals = async (req, res) => {
  try {
    const rentals = await pool.query(
      `
      SELECT rentals.*, cars.brand, cars.model
      FROM rentals
      JOIN cars ON cars.id = rentals.car_id
      WHERE rentals.user_id = $1
      ORDER BY rentals.start_date DESC
      `,
      [req.user.id]
    );

    res.json(rentals.rows);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

};

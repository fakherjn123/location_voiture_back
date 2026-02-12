const pool = require("../config/db");

/**
 * 🔄 Mise à jour automatique des statuts + factures
 */
const updateRentalStatuses = async () => {
  const updated = await pool.query(`
    UPDATE rentals
    SET status =
      CASE
        WHEN status = 'cancelled' THEN status
        WHEN NOW() < start_date THEN 'confirmed'
        WHEN NOW() BETWEEN start_date AND end_date THEN 'ongoing'
        WHEN NOW() > end_date THEN 'completed'
      END
    WHERE status != 'completed'
    RETURNING *
  `);

  // 🧾 Création automatique des factures
  for (const rental of updated.rows) {
    if (rental.status === "completed") {
      await pool.query(
        `
        INSERT INTO facture (user_id, rental_id, total)
        VALUES ($1, $2, $3)
        ON CONFLICT (rental_id) DO NOTHING
        `,
        [rental.user_id, rental.id, rental.total_price]
      );
    }
  }
};

/**
 * 🚗 RENT A CAR
 */
exports.rentCar = async (req, res) => {
  try {
    const { car_id, start_date, end_date } = req.body;
    const user_id = req.user.id;

    if (!car_id || !start_date || !end_date) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (new Date(end_date) <= new Date(start_date)) {
      return res.status(400).json({ message: "Invalid dates" });
    }

    // Vérifier voiture
    const carResult = await pool.query(
      "SELECT * FROM cars WHERE id = $1",
      [car_id]
    );

    if (carResult.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    const car = carResult.rows[0];

    // Conflit de dates
    const conflict = await pool.query(
      `
      SELECT 1 FROM rentals
      WHERE car_id = $1
        AND status != 'cancelled'
        AND NOT (
          end_date < $2 OR start_date > $3
        )
      `,
      [car_id, start_date, end_date]
    );

    if (conflict.rows.length > 0) {
      return res.status(400).json({
        message: "Car not available for selected dates"
      });
    }

    // Calcul prix
    const days =
      (new Date(end_date) - new Date(start_date)) /
      (1000 * 60 * 60 * 24);

    const baseTotal = days * car.price_per_day;

    // Fidélité
    const userResult = await pool.query(
      "SELECT points FROM users WHERE id = $1",
      [user_id]
    );

    let userPoints = userResult.rows[0].points || 0;
    let discount = 0;

    if (userPoints >= 100) {
      discount = baseTotal * 0.1;
      userPoints -= 100;
    }

    const finalTotal = baseTotal - discount;
    const pointsEarned = Math.floor(days * 10);
    userPoints += pointsEarned;

    // Création location
    const rental = await pool.query(
      `
      INSERT INTO rentals (
        user_id, car_id, start_date, end_date, total_price, status
      )
      VALUES ($1,$2,$3,$4,$5,'confirmed')
      RETURNING *
      `,
      [user_id, car_id, start_date, end_date, finalTotal]
    );
await pool.query(
  `
  INSERT INTO facture (user_id, rental_id, total)
  VALUES ($1, $2, $3)
  `,
  [user_id, rental.rows[0].id, finalTotal]
);
    // MAJ points
    await pool.query(
      "UPDATE users SET points = $1 WHERE id = $2",
      [userPoints, user_id]
    );

    res.status(201).json({
      message: "Car rented successfully",
      rental: rental.rows[0],
      base_total: baseTotal,
      discount,
      final_total: finalTotal,
      points_earned: pointsEarned,
      points_remaining: userPoints
    });

  } catch (error) {
    console.error("RENT CAR ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📄 GET MY RENTALS
 */
exports.getMyRentals = async (req, res) => {
  try {
    await updateRentalStatuses();

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
    console.error("GET MY RENTALS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ❌ CANCEL RENTAL
 */
exports.cancelRental = async (req, res) => {
  try {
    const { id } = req.params;

    const rental = await pool.query(
      `
      UPDATE rentals
      SET status = 'cancelled'
      WHERE id = $1 AND user_id = $2 AND status = 'confirmed'
      RETURNING *
      `,
      [id, req.user.id]
    );

    if (rental.rows.length === 0) {
      return res.status(400).json({
        message: "Cannot cancel this rental"
      });
    }

    res.json({ message: "Rental cancelled" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

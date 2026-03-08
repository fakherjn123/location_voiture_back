const pool = require("../config/db");

/**
 * 🔄 Update rental statuses automatically + create facture only when completed
 */
const updateRentalStatuses = async () => {
  const updated = await pool.query(`
    UPDATE rentals
    SET status =
      CASE
        WHEN status = 'cancelled' THEN status
        WHEN status = 'awaiting_payment' THEN status
        WHEN NOW() < start_date THEN 'confirmed'
        WHEN NOW() BETWEEN start_date AND end_date THEN 'ongoing'
        WHEN NOW() > end_date THEN 'completed'
      END
    WHERE status NOT IN ('completed', 'cancelled', 'awaiting_payment')
    RETURNING *
  `);

  // Create facture only when rental becomes completed
  for (const rental of updated.rows) {
    if (rental.status === "completed") {
      await pool.query(
        `INSERT INTO facture (user_id, rental_id, total)
         VALUES ($1, $2, $3)
         ON CONFLICT (rental_id) DO NOTHING`,
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

    const start = new Date(start_date);
    const end = new Date(end_date);

    if (end <= start) {
      return res.status(400).json({
        message: "End date must be after start date"
      });
    }

    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays < 1) {
      return res.status(400).json({
        message: "Minimum rental duration is 1 day"
      });
    }

    // Check car exists
    const carResult = await pool.query(
      "SELECT * FROM cars WHERE id = $1",
      [car_id]
    );

    if (carResult.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    const car = carResult.rows[0];

    // Check if the car is currently in maintenance
    const maintenanceCheck = await pool.query(
      `SELECT id FROM services 
       WHERE car_id = $1 
         AND status = 'En maintenance'`,
      [car_id]
    );

    if (maintenanceCheck.rows.length > 0) {
      return res.status(400).json({
        message: "Car is currently in maintenance and cannot be rented"
      });
    }

    const conflict = await pool.query(
      `SELECT start_date, end_date FROM rentals
       WHERE car_id = $1
         AND status NOT IN ('cancelled', 'completed')
         AND $2 < end_date
         AND $3 > start_date`,
      [car_id, start_date, end_date]
    );

    if (conflict.rows.length > 0) {
      const conflicts = conflict.rows.map(r => {
        const d1 = new Date(r.start_date);
        const d2 = new Date(r.end_date);
        return {
          start: d1.toISOString().split('T')[0],
          end: d2.toISOString().split('T')[0]
        };
      });
      return res.status(400).json({
        message: "Car not available for selected dates",
        conflicts
      });
    }

    const baseTotal = diffDays * Number(car.price_per_day);

    // Loyalty system
    const userResult = await pool.query(
      "SELECT points FROM users WHERE id = $1",
      [user_id]
    );

    let userPoints = userResult.rows[0]?.points || 0;
    let discount = 0;

    if (userPoints >= 100) {
      discount = baseTotal * 0.1;
      userPoints -= 100;
    }

    const finalTotal = baseTotal - discount;
    const pointsEarned = Math.floor(diffDays * 10);
    userPoints += pointsEarned;

    // Create rental
    const rental = await pool.query(
      `INSERT INTO rentals (user_id, car_id, start_date, end_date, total_price, status)
       VALUES ($1, $2, $3, $4, $5, 'awaiting_payment')
       RETURNING *`,
      [user_id, car_id, start_date, end_date, finalTotal]
    );

    const newRental = rental.rows[0];

    // Create facture immediately upon allocation
    await pool.query(
      `INSERT INTO facture (user_id, rental_id, total)
       VALUES ($1, $2, $3)
       ON CONFLICT (rental_id) DO NOTHING`,
      [user_id, newRental.id, finalTotal]
    );

    // Update points
    await pool.query(
      "UPDATE users SET points = $1 WHERE id = $2",
      [userPoints, user_id]
    );

    res.status(201).json({
      message: "Car rented successfully",
      rental: newRental,
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
 * 📄 GET MY RENTALS (hide cancelled)
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
        AND rentals.status != 'cancelled'
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

    const rentalResult = await pool.query(
      `
      UPDATE rentals
      SET status = 'cancelled'
      WHERE id = $1
        AND user_id = $2
        AND status IN ('confirmed', 'awaiting_payment')
      RETURNING *
      `,
      [id, req.user.id]
    );

    if (rentalResult.rows.length === 0) {
      return res.status(400).json({
        message: "Cannot cancel this rental"
      });
    }

    res.json({
      message: "Rental cancelled successfully"
    });

  } catch (error) {
    console.error("CANCEL RENTAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 👑 GET ALL RENTALS (Admin only)
 */
exports.getAllRentals = async (req, res) => {
  try {
    await updateRentalStatuses();

    const rentals = await pool.query(
      `
      SELECT rentals.*, cars.brand, cars.model, users.name as user_name, users.email as user_email
      FROM rentals
      JOIN cars ON cars.id = rentals.car_id
      JOIN users ON users.id = rentals.user_id
      ORDER BY rentals.start_date DESC
      `
    );

    res.json(rentals.rows);

  } catch (error) {
    console.error("GET ALL RENTALS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📅 GET BOOKED DATES FOR A CAR
 */
exports.getCarBookedDates = async (req, res) => {
  try {
    const { car_id } = req.params;
    const result = await pool.query(
      `SELECT start_date, end_date FROM rentals 
       WHERE car_id = $1 AND status NOT IN ('cancelled', 'completed')`,
      [car_id]
    );

    const dates = result.rows.map(r => ({
      start: r.start_date,
      end: r.end_date
    }));

    res.json(dates);
  } catch (error) {
    console.error("GET BOOKED DATES ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

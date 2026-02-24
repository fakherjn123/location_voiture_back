const pool = require("../config/db");

/**
 * 🔹 ADMIN – Bloquer / Débloquer voiture
 */
exports.toggleAvailability = async (req, res) => {
  try {
    const { car_id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(
      `UPDATE cars
       SET is_active = $1
       WHERE id = $2
       RETURNING *`,
      [is_active, car_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    res.json({
      message: "Availability updated",
      car: result.rows[0]
    });

  } catch (error) {
    console.error("TOGGLE AVAILABILITY ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔹 PUBLIC – Vérifier disponibilité par dates
 */
exports.checkAvailability = async (req, res) => {
  try {
    const { car_id } = req.params;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        message: "start_date and end_date required"
      });
    }

    const conflict = await pool.query(
      `
      SELECT 1 FROM rentals
      WHERE car_id = $1
        AND status IN ('confirmed', 'ongoing')
        AND NOT (
          end_date < $2
          OR start_date > $3
        )
      `,
      [car_id, start_date, end_date]
    );

    res.json({
      available: conflict.rows.length === 0
    });

  } catch (error) {
    console.error("CHECK AVAILABILITY ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔹 PUBLIC – Lister voitures actives
 */
exports.getActiveCars = async (req, res) => {
  try {
    const cars = await pool.query(
      `SELECT * FROM cars WHERE is_active = true`
    );

    res.json(cars.rows);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
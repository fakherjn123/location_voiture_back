const pool = require("../config/db");

/**
 * USER - CREATE PAYMENT
 */
exports.createPayment = async (req, res) => {
  try {
    const { rental_id, amount, method } = req.body;

    if (!rental_id || !amount || !method) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const payment = await pool.query(
      `INSERT INTO payments (rental_id, amount, method)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [rental_id, amount, method]
    );

    res.status(201).json(payment.rows[0]);
  } catch (err) {
    console.error("CREATE PAYMENT ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * USER - GET MY PAYMENTS
 */
exports.getMyPayments = async (req, res) => {
  try {
    const payments = await pool.query(
      `SELECT p.*
       FROM payments p
       JOIN rentals r ON r.id = p.rental_id
       WHERE r.user_id = $1`,
      [req.user.id]
    );

    res.json(payments.rows);
  } catch (err) {
    console.error("MY PAYMENTS ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * ADMIN - GET ALL PAYMENTS
 */
exports.getAllPayments = async (req, res) => {
  try {
    const payments = await pool.query(
      "SELECT * FROM payments ORDER BY id DESC"
    );

    res.json(payments.rows);
  } catch (err) {
    console.error("GET ALL PAYMENTS ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

const pool = require("../config/db");

/**
 * 👀 GET REVIEWS FOR A CAR (VISITEUR)
 */
exports.getCarReviews = async (req, res) => {
  try {
    const { car_id } = req.params;

    const reviews = await pool.query(
      `
      SELECT r.id, r.rating, r.comment, r.created_at, u.name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.car_id = $1
      ORDER BY r.created_at DESC
      `,
      [car_id]
    );

    res.json(reviews.rows);
  } catch (error) {
    console.error("GET REVIEWS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ⭐ ADD REVIEW (CLIENT – AFTER RENTAL)
 */
exports.addReview = async (req, res) => {
  try {
    const { car_id, rating, comment } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!car_id || rating === undefined) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // ✅ FORCER rating en nombre
    const ratingNumber = Number(rating);

    if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
      return res.status(400).json({
        message: "Rating must be an integer between 1 and 10"
      });
    }

    const user_id = req.user.id;

    // ✅ Vérifier location terminée
    const rental = await pool.query(
      `
      SELECT 1
      FROM rentals
      WHERE user_id = $1
        AND car_id = $2
        AND end_date < NOW()
      `,
      [user_id, car_id]
    );

    if (rental.rows.length === 0) {
      return res.status(403).json({
        message: "Review allowed only after completed rental"
      });
    }

    // ✅ Insertion sécurisée
    const review = await pool.query(
      `
      INSERT INTO reviews (user_id, car_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [user_id, car_id, ratingNumber, comment || null]
    );

    res.status(201).json(review.rows[0]);

  } catch (error) {
    console.error("🔥 ADD REVIEW ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already reviewed this car"
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        message: "Invalid car or user reference"
      });
    }

    res.status(500).json({
      message: "Server error",
      detail: error.message
    });
  }
};

/**
 * ✏️ UPDATE MY REVIEW
 */
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    let ratingValue = null;

    if (rating !== undefined) {
      ratingValue = Number(rating);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 10) {
        return res.status(400).json({
          message: "Rating must be an integer between 1 and 10"
        });
      }
    }

    const review = await pool.query(
      `
      UPDATE reviews
      SET
        rating = COALESCE($1, rating),
        comment = COALESCE($2, comment)
      WHERE id = $3 AND user_id = $4
      RETURNING *
      `,
      [ratingValue, comment ?? null, id, req.user.id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json(review.rows[0]);
  } catch (error) {
    console.error("UPDATE REVIEW ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🗑️ DELETE MY REVIEW
 */
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM reviews
      WHERE id = $1 AND user_id = $2
      `,
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ message: "Review deleted" });
  } catch (error) {
    console.error("DELETE REVIEW ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

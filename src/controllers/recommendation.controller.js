const pool = require("../config/db");

exports.getRecommendation = async (req, res) => {
  try {
    // We removed budget and days requirement, so just select an available car to recommend
    const query = "SELECT * FROM cars WHERE available = true";
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Aucune voiture disponible" });
    }

    // Pick a random available car as a suggestion
    const randomIndex = Math.floor(Math.random() * result.rows.length);
    const bestCar = result.rows[randomIndex];

    return res.status(200).json({
      message: "Basé sur notre sélection, ce véhicule correspond parfaitement à vos attentes pour une expérience inoubliable.",
      recommendation: bestCar
    });

  } catch (err) {
    console.error("RECOMMENDATION ERROR:", err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

const pool = require("../config/db");

/**
 * 🚗 GET CARS (avec filtres)
 * /api/cars?brand=bmw&available=true&maxPrice=300
 */
exports.getCars = async (req, res) => {
  try {
    const { brand, available, maxPrice } = req.query;

    let query = "SELECT * FROM cars WHERE 1=1";
    const values = [];
    let i = 1;

    if (brand) {
      query += ` AND brand ILIKE $${i++}`;
      values.push(`%${brand}%`);
    }

    if (available !== undefined) {
      query += ` AND available = $${i++}`;
      values.push(available === "true");
    }

    if (maxPrice) {
      query += ` AND price_per_day <= $${i++}`;
      values.push(Number(maxPrice));
    }

    const cars = await pool.query(query, values);
    res.status(200).json(cars.rows);

  } catch (error) {
    console.error("GET CARS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * ➕ ADD CAR (ADMIN)
 */
exports.addCar = async (req, res) => {
  try {
    const { brand, model, price_per_day } = req.body;

    if (!brand || !model || !price_per_day) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const car = await pool.query(
      `INSERT INTO cars (brand, model, price_per_day, available)
       VALUES ($1,$2,$3,true)
       RETURNING *`,
      [brand, model, Number(price_per_day)]
    );

    res.status(201).json(car.rows[0]);

  } catch (error) {
    console.error("ADD CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * ✏️ UPDATE CAR (ADMIN) – update partiel sécurisé
 */
exports.updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const { brand, model, price_per_day, available } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Car ID required" });
    }

    const car = await pool.query(
      `UPDATE cars SET
        brand = COALESCE($1, brand),
        model = COALESCE($2, model),
        price_per_day = COALESCE($3, price_per_day),
        available = COALESCE($4, available)
       WHERE id = $5
       RETURNING *`,
      [
        brand ?? null,
        model ?? null,
        price_per_day !== undefined ? Number(price_per_day) : null,
        available !== undefined ? available : null,
        id
      ]
    );

    if (car.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    res.status(200).json(car.rows[0]);

  } catch (error) {
    console.error("UPDATE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * 🗑️ DELETE CAR (ADMIN)
 */
exports.deleteCar = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM cars WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    res.status(200).json({ message: "Car deleted successfully" });

  } catch (error) {
    console.error("DELETE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

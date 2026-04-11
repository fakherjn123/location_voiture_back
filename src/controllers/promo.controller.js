const pool = require("../config/db");

// CREATE
exports.createPromoCode = async (req, res) => {
  try {
    const { code, discount_type, discount_value, expiration_date, usage_limit, description } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const newCode = await pool.query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, expiration_date, usage_limit, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [code.toUpperCase(), discount_type, discount_value, expiration_date || null, usage_limit || null, description || null]
    );

    res.status(201).json(newCode.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: "Ce code promo existe déjà." });
    }
    // If description column does not exist, fallback to ignoring it
    if (error.code === '42703') {
      try {
        const { code, discount_type, discount_value, expiration_date, usage_limit } = req.body;
        const newCode = await pool.query(
          `INSERT INTO promo_codes (code, discount_type, discount_value, expiration_date, usage_limit) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [code.toUpperCase(), discount_type, discount_value, expiration_date || null, usage_limit || null]
        );
        return res.status(201).json(newCode.rows[0]);
      } catch (fallbackError) {
        console.error("CREATE PROMO CODE FALLBACK ERROR:", fallbackError);
        return res.status(500).json({ message: "Erreur serveur" });
      }
    }
    console.error("CREATE PROMO CODE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// GET ALL
exports.getAllPromoCodes = async (req, res) => {
  try {
    const codes = await pool.query(`SELECT * FROM promo_codes ORDER BY created_at DESC`);
    res.json(codes.rows);
  } catch (error) {
    console.error("GET ALL PROMO CODES ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// TOGGLE STATUS
exports.togglePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(
      `UPDATE promo_codes SET is_active = $1 WHERE id = $2 RETURNING *`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Code non trouvé" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("TOGGLE PROMO ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// UPDATE
exports.updatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discount_type, discount_value, expiration_date, usage_limit, description } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    let result;
    try {
      result = await pool.query(
        `UPDATE promo_codes 
         SET code = $1, discount_type = $2, discount_value = $3, expiration_date = $4, usage_limit = $5, description = $6
         WHERE id = $7 RETURNING *`,
        [code.toUpperCase(), discount_type, discount_value, expiration_date || null, usage_limit || null, description || null, id]
      );
    } catch (dbError) {
      if (dbError.code === '42703') { // description does not exist
        result = await pool.query(
          `UPDATE promo_codes 
           SET code = $1, discount_type = $2, discount_value = $3, expiration_date = $4, usage_limit = $5
           WHERE id = $6 RETURNING *`,
          [code.toUpperCase(), discount_type, discount_value, expiration_date || null, usage_limit || null, id]
        );
      } else {
        throw dbError;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Code non trouvé" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: "Ce code promo existe déjà." });
    }
    console.error("UPDATE PROMO ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// DELETE
exports.deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`DELETE FROM promo_codes WHERE id = $1 RETURNING *`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Code non trouvé" });
    }

    res.json({ message: "Code promo supprimé avec succès." });
  } catch (error) {
    console.error("DELETE PROMO ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// VALIDATE (Client Side)
exports.validatePromoCode = async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: "Veuillez fournir un code." });
    }

    const check = await pool.query(
      `SELECT * FROM promo_codes WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Code promo invalide." });
    }

    const promo = check.rows[0];

    if (!promo.is_active) {
      return res.status(400).json({ message: "Ce code promo a été désactivé." });
    }

    if (promo.expiration_date && new Date() > new Date(promo.expiration_date)) {
      return res.status(400).json({ message: "Ce code promo a expiré." });
    }

    if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
      return res.status(400).json({ message: "Ce code promo a atteint sa limite d'utilisation." });
    }

    res.json({
      valid: true,
      promo
    });
  } catch (error) {
    console.error("VALIDATE PROMO ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

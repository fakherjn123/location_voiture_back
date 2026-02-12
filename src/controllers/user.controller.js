const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

/**
 * =========================
 * REGISTER / ADD CLIENT
 * =========================
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'client') RETURNING id, name, email, role",
      [name, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * =========================
 * ADD CLIENT (ADMIN)
 * =========================
 */
exports.addClient = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'client') RETURNING id, name, email, role",
      [name, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("ADD CLIENT ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * =========================
 * ADD ADMIN (ADMIN)
 * =========================
 */

/**
 * =========================
 * LOGIN
 * =========================
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Email incorrect" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const token = jwt.sign(
  {
    id: user.id,
    role: user.role,   // 🔴 OBLIGATOIRE
    email: user.email
  },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);

    res.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * =========================
 * GET USERS (ADMIN)
 * =========================
 */
exports.getUsers = async (req, res) => {
  const users = await pool.query(
    "SELECT id, name, email, role FROM users"
  );
  res.json(users.rows);
};

/**
 * =========================
 * GET MY RENTALS (USER)
 * =========================
 */
exports.getUserRentals = async (req, res) => {
  const rentals = await pool.query(
    "SELECT * FROM rentals WHERE user_id = $1",
    [req.user.id]
  );
  res.json(rentals.rows);
};
exports.getMyProfile = async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT id, name, email, role, points FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await pool.query(
      `
      UPDATE users
      SET name = $1, email = $2
      WHERE id = $3
      RETURNING id, name, email
      `,
      [name, email, req.user.id]
    );

    res.json({
      message: "Profile updated successfully",
      user: user.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
/**
 * =========================
 * LOGOUT
 * =========================
 */
exports.logout = (req, res) => {
  return res.status(200).json({
    message: "Déconnexion réussie"
  });
};

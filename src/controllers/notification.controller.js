const pool = require("../config/db");

// GET ALL FOR USER
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET NOTIFS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// MARK AS READ
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    await pool.query(
      `UPDATE notifications SET is_read = true 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    res.json({ message: "Notification marquée comme lue" });
  } catch (error) {
    console.error("READ NOTIF ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// MARK ALL AS READ
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [userId]
    );
    res.json({ message: "Toutes les notifications marquées comme lues" });
  } catch (error) {
    console.error("READ ALL NOTIFS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// HELPER FOR SERVER-SIDE CREATION
exports.createNotification = async (userId, title, message, type = 'info') => {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, title, message, type]
    );
    return result.rows[0];
  } catch (error) {
    console.error("CREATE NOTIF HELPER ERROR:", error);
    return null;
  }
};

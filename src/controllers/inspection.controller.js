const pool = require("../config/db");
const notificationController = require("./notification.controller");

exports.createInspection = async (req, res) => {
  try {
    const { rental_id, type } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    // Vérifier si la location existe
    const rentalCheck = await pool.query("SELECT * FROM rentals WHERE id = $1", [rental_id]);
    if (rentalCheck.rows.length === 0) return res.status(404).json({ message: "Location introuvable" });

    const rental = rentalCheck.rows[0];

    // Créer l'inspection
    const result = await pool.query(
      `INSERT INTO inspections (rental_id, type, client_id, admin_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [rental_id, type, rental.user_id, role === 'admin' ? userId : null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("CREATE INSPECTION ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.updateInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const { fuel_level, mileage, exterior_notes, interior_notes, photos } = req.body;

    const result = await pool.query(
      `UPDATE inspections 
       SET fuel_level = $1, mileage = $2, exterior_notes = $3, interior_notes = $4, photos = $5
       WHERE id = $6 RETURNING *`,
      [fuel_level, mileage, exterior_notes, interior_notes, JSON.stringify(photos || []), id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Inspection introuvable" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("UPDATE INSPECTION ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.signInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    let query = "";
    if (role === 'admin') {
      query = "UPDATE inspections SET admin_signature = true, admin_id = $1 WHERE id = $2 RETURNING *";
    } else {
      query = "UPDATE inspections SET client_signature = true WHERE id = $2 AND client_id = $1 RETURNING *";
    }

    const result = await pool.query(query, [userId, id]);

    if (result.rows.length === 0) return res.status(404).json({ message: "Inspection introuvable ou non autorisée" });

    const inspection = result.rows[0];

    // Notification si les deux ont signé
    if (inspection.client_signature && inspection.admin_signature) {
      const io = req.app.get("io");
      const title = `État des lieux ${inspection.type === 'check_in' ? 'Départ' : 'Retour'} Terminé`;
      const msg = `L'état des lieux pour la location #${inspection.rental_id} a été validé par les deux parties.`;
      
      await notificationController.createNotification(inspection.client_id, title, msg, "success");
      if (io) {
        io.to(`user-${inspection.client_id}`).emit("new_notification", { title, message: msg, type: "success" });
        io.to("admin-room").emit("new_notification", { title, message: msg, type: "success" });
      }
    }

    res.json(inspection);
  } catch (error) {
    console.error("SIGN INSPECTION ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.getRentalInspections = async (req, res) => {
  try {
    const { rentalId } = req.params;
    const result = await pool.query(
      "SELECT * FROM inspections WHERE rental_id = $1 ORDER BY created_at ASC",
      [rentalId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET INSPECTIONS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

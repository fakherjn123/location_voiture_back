const pool = require("../config/db");

const updateRentalStatuses = async () => {
  // Annulation automatique (No-Show) après 1 jour
  await pool.query(`
    UPDATE rentals
    SET status = 'cancelled'
    WHERE status IN ('awaiting_payment', 'pending')
      AND NOW() > (start_date + INTERVAL '1 day')
  `);

  const updated = await pool.query(`
    UPDATE rentals
    SET status =
      CASE
        WHEN NOW() < start_date THEN 'confirmed'
        WHEN NOW() BETWEEN start_date AND end_date THEN 'ongoing'
        WHEN NOW() > end_date THEN 'completed'
      END
    WHERE status NOT IN ('completed', 'cancelled', 'awaiting_payment', 'pending')
    RETURNING *
  `);

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



exports.rentCar = async (req, res) => {
  try {
    const { 
      car_id, start_date, end_date, 
      delivery_requested, delivery_address, delivery_lat, delivery_lng, delivery_time 
    } = req.body;
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

    // Reject past start dates
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (start < todayStart) {
      return res.status(400).json({
        message: "La date de prise en charge ne peut pas être dans le passé"
      });
    }

    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays < 1) {
      return res.status(400).json({
        message: "Minimum rental duration is 1 day"
      });
    }

    // Check if the user's driving license is approved
    const userCheck = await pool.query(
      "SELECT driving_license_status FROM users WHERE id = $1",
      [user_id]
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].driving_license_status !== 'approved') {
      return res.status(403).json({
        message: "Action refusée. Votre permis de conduire n'est pas encore validé par l'agence."
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
         AND $2 < (end_date + INTERVAL '3 hours')
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

    // Check if user has points to get discount (just for calculating final total)
    // Points deduction will happen during payment
    const userResult = await pool.query(
      "SELECT points FROM users WHERE id = $1",
      [user_id]
    );

    let userPoints = userResult.rows[0]?.points || 0;
    let discount = 0;

    if (userPoints >= 100) {
      discount = baseTotal * 0.1;
    }

    let finalTotal = baseTotal - discount;
    const pointsEarned = Math.floor(diffDays * 10);

    // --- LOGIQUE DE LIVRAISON ---
    let delivery_distance_km = 0;
    let delivery_fee = 0;
    let return_fee = 0;
    let actualDestLat = delivery_lat;
    let actualDestLng = delivery_lng;

    if (delivery_requested) {
      if (!actualDestLat && !actualDestLng && !delivery_address) {
        return res.status(400).json({ message: "Veuillez fournir des coordonnées (lat/lng) ou une adresse pour la livraison" });
      }
      if (!delivery_time) {
        return res.status(400).json({ message: "Veuillez préciser l'heure de livraison souhaitée" });
      }

      const destination = (actualDestLat && actualDestLng) 
        ? `${actualDestLat},${actualDestLng}` 
        : encodeURIComponent(delivery_address);

      const AGENCY_LAT = 35.8353; // Sousse Sahloul
      const AGENCY_LNG = 10.5944;
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyBOOflQXcbdbG22UscFvYLhwmx5TfM2sTc";
      const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${AGENCY_LAT},${AGENCY_LNG}&destinations=${destination}&key=${apiKey}`;

      try {
        const response = await fetch(googleUrl);
        const data = await response.json();
        
        if (data.status === "OK" && data.rows && data.rows[0].elements && data.rows[0].elements[0].status === "OK") {
          delivery_distance_km = data.rows[0].elements[0].distance.value / 1000;
        } else {
          throw new Error("Impossible de calculer la distance avec Google Maps");
        }
      } catch (err) {
        console.error("Google Maps API error:", err.message);
        if (actualDestLat && actualDestLng) {
          // Fallback Haversine si on a les coordonnées
          const R = 6371;
          const dLat = (actualDestLat - AGENCY_LAT) * (Math.PI / 180);
          const dLon = (actualDestLng - AGENCY_LNG) * (Math.PI / 180);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(AGENCY_LAT * (Math.PI / 180)) * Math.cos(actualDestLat * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          delivery_distance_km = R * c * 1.3;
        } else {
          return res.status(400).json({ message: "Adresse introuvable ou erreur de calcul Google Maps." });
        }
      }
      if (delivery_distance_km > 100) {
        return res.status(400).json({ 
          message: `Désolé, nous ne livrons pas au-delà de 100 km de notre agence. (Distance calculée: ${delivery_distance_km.toFixed(1)} km)`
        });
      }

      delivery_fee = Math.max(5, parseFloat((delivery_distance_km * 1.5).toFixed(2)));
      return_fee = delivery_fee;
      finalTotal += (delivery_fee + return_fee);
    }

    // Create rental with status 'pending'
    const rental = await pool.query(
      `INSERT INTO rentals (
         user_id, car_id, start_date, end_date, total_price, status,
         delivery_requested, delivery_address, delivery_lat, delivery_lng,
         delivery_distance_km, delivery_fee, return_fee, delivery_status, return_status, delivery_time
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        user_id, car_id, start_date, end_date, finalTotal,
        delivery_requested ? true : false,
        delivery_requested ? delivery_address : null,
        delivery_requested ? actualDestLat : null,
        delivery_requested ? actualDestLng : null,
        delivery_requested ? delivery_distance_km : null,
        delivery_requested ? delivery_fee : 0,
        delivery_requested ? return_fee : 0,
        delivery_requested ? 'pending' : null,
        delivery_requested ? 'pending' : null,
        delivery_requested ? delivery_time : null
      ]
    );

    const newRental = rental.rows[0];

    // ------------------------------------------

    const io = req.app.get("io");
    if (io) {
      io.to("admin-room").emit("new_notification", {
        type: "new_rental",
        title: "Nouvelle Réservation",
        message: `Une nouvelle réservation a été créée pour la ${car.brand} ${car.model}.`,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      message: "Car booked temporarily",
      rental: newRental,
      base_total: baseTotal,
      discount,
      final_total: finalTotal,
      points_earned: pointsEarned
    });

  } catch (error) {
    console.error("RENT CAR ERROR:", error);
    require('fs').appendFileSync('error.log', "Error: " + error.message + "\n" + error.stack + "\n");
    res.status(500).json({ message: "Server error" });
  }
};



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



exports.cancelRental = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const preCheck = await pool.query(
      `
      SELECT rentals.*, cars.brand, cars.model
      FROM rentals
      JOIN cars ON cars.id = rentals.car_id
      WHERE rentals.id = $1 AND rentals.user_id = $2
      `,
      [id, user_id]
    );

    if (preCheck.rows.length === 0) {
      return res.status(404).json({ message: "Rental not found or unauthorized" });
    }

    const rental = preCheck.rows[0];

    if (['cancelled', 'completed'].includes(rental.status)) {
      return res.status(400).json({
        message: "Cannot cancel this rental (already cancelled or completed)"
      });
    }

    const now = new Date();
    const startDate = new Date(rental.start_date);
    const diffHours = (startDate - now) / (1000 * 60 * 60);

    if (diffHours < 48) {
      return res.status(400).json({
        message: "You cannot cancel a booking less than 48 hours before it starts. Please contact the agency."
      });
    }

    const paymentCheck = await pool.query(
      `SELECT * FROM payments WHERE rental_id = $1 AND status = 'paid'`,
      [id]
    );
    const hasPaid = paymentCheck.rows.length > 0;
    const requiresRefund = hasPaid || rental.status === 'confirmed' || rental.status === 'ongoing';

    await pool.query(
      `
      UPDATE rentals
      SET status = 'cancelled'
      WHERE id = $1
      `,
      [id]
    );

    if (requiresRefund) {
      await pool.query(
        `UPDATE payments SET refund_status = 'pending' WHERE rental_id = $1 AND status = 'paid'`,
        [id]
      );
    }

    const { sendEmail } = require("../services/email.service");
    await sendEmail({
      to: rental.email,
      subject: "Confirmation d'Annulation de Réservation - BMZ Location",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Annulation Confirmée</h2>
          <p>Bonjour ${rental.user_name || 'Client'},</p>
          <p>Vous avez annulé avec succès votre réservation pour la <strong>${rental.brand} ${rental.model}</strong>.</p>
          ${requiresRefund ? 
            `<p>Comme un paiement a été effectué, <strong>un remboursement est actuellement en attente</strong>. Vous serez notifié dès qu'il sera traité.</p>` : 
            `<p>Aucun paiement n'ayant été débité, aucune procédure de remboursement n'est requise.</p>`
          }
          <p>Nous espérons vous revoir bientôt chez BMZ Location.</p>
        </div>
      `
    });

    res.json({
      message: "Booking cancelled successfully. If you had paid, a refund is now pending.",
      requiresRefund
    });
  } catch (error) {
    console.error("CLIENT CANCEL RENTAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.adminCancelRental = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Récupérer les détails de la réservation AVANT annulation
    const preCheck = await pool.query(
      `
      SELECT rentals.*, users.email, users.name as user_name, cars.brand, cars.model
      FROM rentals
      JOIN users ON users.id = rentals.user_id
      JOIN cars ON cars.id = rentals.car_id
      WHERE rentals.id = $1
      `,
      [id]
    );

    if (preCheck.rows.length === 0) {
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = preCheck.rows[0];

    if (['cancelled', 'completed'].includes(rental.status)) {
      return res.status(400).json({
        message: "Cannot cancel this rental (already cancelled or completed)"
      });
    }

    // 2. Vérifier si un paiement a été effectué
    const paymentCheck = await pool.query(
      `SELECT * FROM payments WHERE rental_id = $1 AND status = 'paid'`,
      [id]
    );
    const hasPaid = paymentCheck.rows.length > 0;
    const requiresRefund = hasPaid || rental.status === 'confirmed' || rental.status === 'ongoing';

    // 3. Mettre à jour le statut de la location
    await pool.query(
      `
      UPDATE rentals
      SET status = 'cancelled'
      WHERE id = $1
      `,
      [id]
    );

    // Mettre en attente de remboursement s'il y a eu paiement
    if (requiresRefund) {
      await pool.query(
        `UPDATE payments SET refund_status = 'pending' WHERE rental_id = $1 AND status = 'paid'`,
        [id]
      );
    }

    // 4. Envoyer l'email au client UNIQUEMENT s'il doit être remboursé
    if (requiresRefund) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Annulation de Réservation</h2>
          <p>Bonjour ${rental.user_name || 'Client'},</p>
          <p>Nous vous informons que votre réservation pour le véhicule <strong>${rental.brand} ${rental.model}</strong> (du ${new Date(rental.start_date).toLocaleDateString("fr-FR")} au ${new Date(rental.end_date).toLocaleDateString("fr-FR")}) a été annulée par notre agence.</p>
          
          <div style="background: #fdf2f8; padding: 15px; border-left: 4px solid #be185d; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #be185d;">Procédure de Remboursement</p>
            <p style="margin: 5px 0 0;">Puisque votre réservation avait été validée, un remboursement intégral d'un montant de <strong>${rental.total_price} DT</strong> vous sera restitué dans les plus brefs délais.</p>
          </div>
          
          <p>Nous sommes désolés pour la gêne occasionnée.</p>
          <p>Cordialement,<br>L'équipe BMZ Location</p>
        </div>
      `;

      try {
        const { sendEmail } = require("../services/email.service");
        await sendEmail(
          rental.email,
          "Avis d'annulation et Remboursement - BMZ Location",
          `Votre réservation pour la ${rental.brand} ${rental.model} a été annulée. Un remboursement de ${rental.total_price} DT sera effectué prochainement.`,
          emailHtml
        );
      } catch (err) {
        console.error("Failed to send cancellation email:", err);
      }
    }

    res.json({ 
      message: "Rental cancelled by admin successfully",
      requiresRefund,
      refundAmount: rental.total_price,
      clientName: rental.user_name || 'Client'
    });

  } catch (error) {
    console.error("ADMIN CANCEL RENTAL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getAllRentals = async (req, res) => {
  try {
    await updateRentalStatuses();

    const rentals = await pool.query(
      `
      SELECT rentals.*, cars.brand, cars.model, users.name as user_name, users.email as user_email
      FROM rentals
      JOIN cars ON cars.id = rentals.car_id
      JOIN users ON users.id = rentals.user_id
      WHERE rentals.status != 'pending'
      ORDER BY rentals.start_date DESC
      `
    );

    res.json(rentals.rows);

  } catch (error) {
    console.error("GET ALL RENTALS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};



exports.getCarBookedDates = async (req, res) => {
  try {
    const { car_id } = req.params;
    const result = await pool.query(
      `SELECT start_date, (end_date + INTERVAL '3 hours') AS end_date FROM rentals 
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

exports.getRentalsByCar = async (req, res) => {
  try {
    const { car_id } = req.params;
    const rentals = await pool.query(
      `
      SELECT rentals.*, users.name as user_name, users.email as user_email
      FROM rentals
      JOIN users ON users.id = rentals.user_id
      WHERE rentals.car_id = $1
      ORDER BY rentals.start_date DESC
      `,
      [car_id]
    );

    res.json(rentals.rows);
  } catch (error) {
    console.error("GET RENTALS BY CAR ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

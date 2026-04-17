const pool = require("../config/db");
const { sendEmail } = require("../services/email.service");
const { triggerN8n } = require("../services/n8n.service");
const notificationController = require("./notification.controller");
// Note: using native fetch (Node.js 18+)


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

      // IDEA 3: Review Relance n8n hook
      try {
        const userInfo = await pool.query(
          `SELECT u.email, u.name, c.brand, c.model
           FROM users u, cars c
           WHERE u.id = $1 AND c.id = $2`,
          [rental.user_id, rental.car_id]
 
        );
        const info = userInfo.rows[0] || {};
        triggerN8n(process.env.N8N_WEBHOOK_REVIEW_RELANCE, {
          event: "rental_completed",
          rental_id: rental.id,
          user_id: rental.user_id,
          car_id: rental.car_id,
          total_price: rental.total_price,
          end_date: rental.end_date,
          clientEmail: info.email,
          clientName: info.name,
          carBrand: info.brand,
          carModel: info.model
        });
      } catch (n8nErr) {
        console.error("n8n review hook error:", n8nErr);
      }
    }
  }
};



exports.rentCar = async (req, res) => {
  try {
    const {
      car_id, start_date, end_date,
      delivery_requested, delivery_address, delivery_lat, delivery_lng, delivery_time,
      promo_code
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
         AND status IN ('confirmed', 'ongoing')
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

    let discount = 0;
    let appliedPromo = null;

    // Si on a un code promo, il écrase la fidélité
    if (promo_code) {
      const checkPromo = await pool.query(
        "SELECT * FROM promo_codes WHERE code = $1 AND is_active = true",
        [promo_code.toUpperCase()]
      );

      if (checkPromo.rows.length > 0) {
        const promo = checkPromo.rows[0];
        const isValidDate = !promo.expiration_date || new Date(promo.expiration_date) > new Date();
        const isValidLimit = !promo.usage_limit || promo.used_count < promo.usage_limit;

        if (isValidDate && isValidLimit) {
          appliedPromo = promo;
          if (promo.discount_type === 'percentage') {
            discount = baseTotal * (Number(promo.discount_value) / 100);
          } else {
            discount = Number(promo.discount_value);
          }
        }
      }
    }

    // SI AUCUN CODE PROMO N'A MARCHE, vérifier la fidélité
    if (!appliedPromo) {
      const userResult = await pool.query("SELECT points FROM users WHERE id = $1", [user_id]);
      let userPoints = userResult.rows[0]?.points || 0;
      if (userPoints >= 100) {
        discount = baseTotal * 0.1;
      }
    }

    let finalTotal = baseTotal - discount;
    if (finalTotal < 0) finalTotal = 0; // ne jamais être négatif

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
         delivery_distance_km, delivery_fee, return_fee, delivery_status, return_status, delivery_time,
         promo_code, discount_amount
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        delivery_requested ? delivery_time : null,
        appliedPromo ? appliedPromo.code : null,
        discount
      ]
    );

    // Increment promo code used_count
    if (appliedPromo) {
      await pool.query("UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1", [appliedPromo.id]);
    }

    const newRental = rental.rows[0];

    // ------------------------------------------

    // ------------------------------------------
    // Real-time & DB Notifications
    const io = req.app.get("io");
    
    // 1. Pour l'Admin
    const adminNotif = await notificationController.createNotification(
      null, // null ou ID admin si existant
      "Nouvelle Réservation",
      `Une nouvelle réservation (#${newRental.id}) a été reçue pour la ${car.brand} ${car.model}.`,
      "new_rental"
    );
    if (io) {
      io.to("admin-room").emit("new_notification", adminNotif || {
        type: "new_rental",
        title: "Nouvelle Réservation",
        message: `Une nouvelle réservation a été créée pour la ${car.brand} ${car.model}.`,
        timestamp: new Date()
      });
    }

    // 2. Pour le Client
    const userNotif = await notificationController.createNotification(
      user_id,
      "Réservation Initiée",
      `Votre réservation pour la ${car.brand} ${car.model} est enregistrée. Veuillez procéder au paiement pour la confirmer.`,
      "info"
    );
    if (io) {
      io.to(`user-${user_id}`).emit("new_notification", userNotif);
    }

    // IDEA 1: New Rental Alert n8n hook
    try {
      const clientInfo = await pool.query(
        "SELECT name, email FROM users WHERE id = $1",
        [user_id]
      );
      const client = clientInfo.rows[0] || {};
      triggerN8n(process.env.N8N_WEBHOOK_NEW_RENTAL, {
        event: "new_rental",
        rental_id: newRental.id,
        clientEmail: client.email,
        clientName: client.name,
        carBrand: car.brand,
        carModel: car.model,
        start_date: newRental.start_date,
        end_date: newRental.end_date,
        total: finalTotal
      });
    } catch (n8nErr) {
      console.error("n8n new rental hook error:", n8nErr);
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

    // SI AUCUN CODE PROMO N'A MARCHE, vérifier la fidélité
    if (!appliedPromo) {
      const userResult = await pool.query("SELECT points FROM users WHERE id = $1", [user_id]);
      let userPoints = userResult.rows[0]?.points || 0;
      if (userPoints >= 100) {
        discount = baseTotal * 0.1;
      }
    }

    let finalTotal = baseTotal - discount;
    if (finalTotal < 0) finalTotal = 0; // ne jamais être négatif

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
         delivery_distance_km, delivery_fee, return_fee, delivery_status, return_status, delivery_time,
         promo_code, discount_amount
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        delivery_requested ? delivery_time : null,
        appliedPromo ? appliedPromo.code : null,
        discount
      ]
    );

    // Increment promo code used_count
    if (appliedPromo) {
      await pool.query("UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1", [appliedPromo.id]);
    }

    const newRental = rental.rows[0];

    // ------------------------------------------

    // ------------------------------------------
    // Real-time & DB Notifications
    const io = req.app.get("io");
    
    // 1. Pour l'Admin
    const adminNotif = await notificationController.createNotification(
      null, // null ou ID admin si existant
      "Nouvelle Réservation",
      `Une nouvelle réservation (#${newRental.id}) a été reçue pour la ${car.brand} ${car.model}.`,
      "new_rental"
    );
    if (io) {
      io.to("admin-room").emit("new_notification", adminNotif || {
        type: "new_rental",
        title: "Nouvelle Réservation",
        message: `Une nouvelle réservation a été créée pour la ${car.brand} ${car.model}.`,
        timestamp: new Date()
      });
    }

    // 2. Pour le Client
    const userNotif = await notificationController.createNotification(
      user_id,
      "Réservation Initiée",
      `Votre réservation pour la ${car.brand} ${car.model} est enregistrée. Veuillez procéder au paiement pour la confirmer.`,
      "info"
    );
    if (io) {
      io.to(`user-${user_id}`).emit("new_notification", userNotif);
    }

    // IDEA 1: New Rental Alert n8n hook
    try {
      const clientInfo = await pool.query(
        "SELECT name, email FROM users WHERE id = $1",
        [user_id]
      );
      const client = clientInfo.rows[0] || {};
      triggerN8n(process.env.N8N_WEBHOOK_NEW_RENTAL, {
        event: "new_rental",
        rental_id: newRental.id,
        clientEmail: client.email,
        clientName: client.name,
        carBrand: car.brand,
        carModel: car.model,
        start_date: newRental.start_date,
        end_date: newRental.end_date,
        total: finalTotal
      });
    } catch (n8nErr) {
      console.error("n8n new rental hook error:", n8nErr);
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

// Prévisualiser le remboursement AVANT d'annuler (sans modifier la location)
exports.cancelPreview = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT rentals.*, cars.brand, cars.model
       FROM rentals
       JOIN cars ON cars.id = rentals.car_id
       WHERE rentals.id = $1 AND rentals.user_id = $2`,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = result.rows[0];
    const now = new Date();
    const startDate = new Date(rental.start_date);
    const createdAt = new Date(rental.created_at);
    const hoursUntilStart = (startDate - now) / (1000 * 60 * 60);
    const hoursSinceBooking = (now - createdAt) / (1000 * 60 * 60);
    const totalPaid = parseFloat(rental.total_price) || 0;

    const paymentCheck = await pool.query(
      `SELECT * FROM payments WHERE rental_id = $1 AND status = 'paid'`,
      [id]
    );
    const hasPaid = paymentCheck.rows.length > 0;

    let refundPercentage = 0;
    let refundAmount = 0;
    const canCancel = hoursUntilStart >= 48;

    if (hasPaid && canCancel) {
      if (hoursSinceBooking <= 24) {
        refundPercentage = 100;
        refundAmount = totalPaid;
      } else {
        refundPercentage = 50;
        refundAmount = parseFloat((totalPaid * 0.5).toFixed(2));
      }
    }

    const hoursLeftIn24hWindow = Math.max(0, 24 - hoursSinceBooking);

    res.json({
      canCancel,
      hoursUntilStart: Math.floor(hoursUntilStart),
      hoursSinceBooking: parseFloat(hoursSinceBooking.toFixed(1)),
      hoursLeftIn24hWindow: parseFloat(hoursLeftIn24hWindow.toFixed(1)),
      isIn24hWindow: hoursSinceBooking <= 24,
      hasPaid,
      totalPaid,
      refundPercentage,
      refundAmount,
      brand: rental.brand,
      model: rental.model,
    });
  } catch (error) {
    console.error("CANCEL PREVIEW ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.cancelRental = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    const preCheck = await pool.query(
      `SELECT rentals.*, users.email, users.name as user_name, cars.brand, cars.model
       FROM rentals
       JOIN cars ON cars.id = rentals.car_id
       JOIN users ON users.id = rentals.user_id
       WHERE rentals.id = $1 AND rentals.user_id = $2`,
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
    const createdAt = new Date(rental.created_at);
    const hoursUntilStart = (startDate - now) / (1000 * 60 * 60);
    const hoursSinceBooking = (now - createdAt) / (1000 * 60 * 60);

    // Block cancellation if less than 48h before start date
    if (hoursUntilStart < 48) {
      return res.status(400).json({
        message: "Impossible d'annuler moins de 48h avant le début de la location. Veuillez contacter l'agence.",
        hoursUntilStart: Math.floor(hoursUntilStart)
      });
    }

    // === POLITIQUE DE REMBOURSEMENT ===
    // - Annulation dans les 24h après réservation → 100% remboursé
    // - Annulation après 24h                      → 50% remboursé
    let refundPercentage = 0;
    let refundAmount = 0;
    const totalPaid = parseFloat(rental.total_price) || 0;

    const paymentCheck = await pool.query(
      `SELECT * FROM payments WHERE rental_id = $1 AND status = 'paid'`,
      [id]
    );
    const hasPaid = paymentCheck.rows.length > 0;

    if (hasPaid) {
      if (hoursSinceBooking <= 24) {
        refundPercentage = 100;
        refundAmount = totalPaid;
      } else {
        refundPercentage = 50;
        refundAmount = parseFloat((totalPaid * 0.5).toFixed(2));
      }
    }

    // Mettre à jour la location
    await pool.query(
      `UPDATE rentals
       SET status = 'cancelled',
           cancelled_at = NOW(),
           refund_amount = $2,
           refund_percentage = $3
       WHERE id = $1`,
      [id, refundAmount, refundPercentage]
    );

    // Marquer le paiement en attente de remboursement
    if (hasPaid && refundAmount > 0) {
      await pool.query(
        `UPDATE payments SET refund_status = 'pending', refund_amount = $2 WHERE rental_id = $1 AND status = 'paid'`,
        [id, refundAmount]
      );
    }

    // Email au client
    const refundMessage = hasPaid
      ? refundPercentage === 100
        ? `<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:15px;margin:16px 0;border-radius:8px;">
             <p style="margin:0;font-weight:700;color:#15803d;">✅ Remboursement intégral — ${refundAmount} TND</p>
             <p style="margin:6px 0 0;font-size:13px;color:#166534;">Annulation dans les 24h : remboursement de <strong>100%</strong> (${refundAmount} TND).</p>
           </div>`
        : `<div style="background:#fffbeb;border-left:4px solid #d97706;padding:15px;margin:16px 0;border-radius:8px;">
             <p style="margin:0;font-weight:700;color:#b45309;">⚠️ Remboursement partiel — ${refundAmount} TND (50%)</p>
             <p style="margin:6px 0 0;font-size:13px;color:#92400e;">Annulation après 24h : remboursement de <strong>50%</strong> (${refundAmount} TND sur ${totalPaid} TND).</p>
           </div>`
      : `<p style="color:#64748b;">Aucun paiement débité, aucun remboursement requis.</p>`;

    const { sendEmail } = require("../services/email.service");
    await sendEmail({
      to: rental.email,
      subject: "Confirmation d'Annulation de Réservation - BMZ Location",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background:linear-gradient(135deg,#0a0a0a,#1e1e2e);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
            <div style="font-size:32px;margin-bottom:8px;">🚗</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">BMZ Location</h1>
          </div>
          <div style="padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#e11d48;border-bottom:2px solid #e11d48;padding-bottom:10px;">Annulation Confirmée</h2>
            <p>Bonjour ${rental.user_name || 'Client'},</p>
            <p>Vous avez annulé votre réservation pour la <strong>${rental.brand} ${rental.model}</strong>.</p>
            ${refundMessage}
            <p style="font-size:12px;color:#94a3b8;margin-top:24px;">BMZ Location — Nous espérons vous revoir bientôt.</p>
          </div>
        </div>
      `
    });

    res.json({
      message: "Réservation annulée avec succès.",
      refundPercentage,
      refundAmount,
      totalPaid,
      hasPaid,
      policy: hoursSinceBooking <= 24
        ? "Annulation dans les 24h — remboursement intégral (100%)"
        : "Annulation après 24h — remboursement partiel (50%)"
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
        await sendEmail({
          to: rental.email,
          subject: "Avis d'annulation et Remboursement - BMZ Location",
          html: emailHtml
        });
      } catch (err) {
        console.error("Failed to send cancellation email:", err);
      }
    }

    // Real-time Notification for User
    const io = req.app.get("io");
    const userNotif = await notificationController.createNotification(
      rental.user_id,
      "Réservation Annulée",
      `Votre réservation #${id} pour la ${rental.brand} ${rental.model} a été annulée par l'administrateur.`,
      "error"
    );
    if (io && userNotif) {
      io.to(`user-${rental.user_id}`).emit("new_notification", userNotif);
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
       WHERE car_id = $1 AND status IN ('confirmed', 'ongoing')`,
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

exports.updateDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { deposit_status, deposit_amount } = req.body;

    const result = await pool.query(
      `UPDATE rentals SET deposit_status = $1, deposit_amount = $2 WHERE id = $3 RETURNING *`,
      [deposit_status, deposit_amount, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Rental not found" });
    // Fetch user and car info to send email notification
    const userQuery = await pool.query(
      'SELECT u.email, u.name, c.brand, c.model FROM users u JOIN rentals r ON u.id = r.user_id JOIN cars c ON c.id = r.car_id WHERE r.id = $1',
      [id]
    );

    if (userQuery.rows.length > 0) {
      const userInfo = userQuery.rows[0];
      let subject = "";
      let messageHtml = "";

      if (deposit_amount > 0 && deposit_status === 'held') {
          subject = "🔒 Garantie (Caution) sécurisée - BMZ Location";
          messageHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; overflow: hidden;">
              <div style="background: #10b981; padding: 24px; text-align: center; color: white;">
                <h1 style="margin:0; font-size: 20px;">Caution Sécurisée</h1>
              </div>
              <div style="padding: 32px;">
                <p>Cher(e) <strong>${userInfo.name}</strong>,</p>
                <p>Nous vous confirmons que votre caution de garantie d'un montant de <strong>${deposit_amount} TND</strong> a été enregistrée et bloquée avec succès pour la location de votre <strong>${userInfo.brand} ${userInfo.model}</strong>.</p>
                <p>Cette somme ne sera pas débitée. Elle vous sera entièrement restituée ou débloquée à la fin de votre location sous réserve que le véhicule soit retourné dans le même état qu'au départ.</p>
                <br>
                <p>Nous vous souhaitons une très bonne route !</p>
                <p style="color: #64748b; font-size: 13px;">L'équipe BMZ Location</p>
              </div>
            </div>
          `;
      } else if (deposit_status === 'returned' || deposit_status === 'refunded') {
          subject = "✅ Caution Restituée avec succès - BMZ Location";
          messageHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; overflow: hidden;">
              <div style="background: #3b82f6; padding: 24px; text-align: center; color: white;">
                <h1 style="margin:0; font-size: 20px;">Caution Restituée</h1>
              </div>
              <div style="padding: 32px;">
                <p>Cher(e) <strong>${userInfo.name}</strong>,</p>
                <p>Bonne nouvelle ! Suite à la fin de votre location pour le véhicule <strong>${userInfo.brand} ${userInfo.model}</strong>, nous vous confirmons que l'empreinte/caution de <strong>${deposit_amount} TND</strong> a bien été levée et restituée dans son intégralité.</p>
                <br>
                <p>Merci de votre confiance et à très bientôt chez BMZ Location !</p>
                <p style="color: #64748b; font-size: 13px;">L'équipe BMZ Location</p>
              </div>
            </div>
          `;
      }

      if (subject !== "") {
        sendEmail({
          to: userInfo.email,
          subject,
          html: messageHtml
        }).catch(err => console.error("DEPOSIT EMAIL ERROR:", err));
      }
    }

    res.json({ message: "Caution mise à jour", rental: result.rows[0] });
  } catch (error) {
    console.error("UPDATE DEPOSIT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updatePenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const { penalty_amount, penalty_reason } = req.body;

    const result = await pool.query(
      `UPDATE rentals SET penalty_amount = $1, penalty_reason = $2 WHERE id = $3 RETURNING *`,
      [penalty_amount, penalty_reason, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Rental not found" });
    res.json({ message: "Pénalité mise à jour", rental: result.rows[0] });
  } catch (error) {
    console.error("UPDATE PENALTY ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

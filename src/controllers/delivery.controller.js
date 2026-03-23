const pool = require("../config/db");

const AGENCY_LAT = 35.8353; // Sousse Sahloul
const AGENCY_LNG = 10.5944;

// Fonction utilitaire pour calculer la distance à vol d'oiseau (Haversine fallback)
const getHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Rayon de la terre en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

exports.calculateDelivery = async (req, res) => {
  try {
    const { address, lat, lng } = req.body;

    let destinationLat = lat || null;
    let destinationLng = lng || null;

    if (!destinationLat && !destinationLng && !address) {
      return res.status(400).json({ message: "Veuillez fournir une adresse ou des coordonnées pour la livraison" });
    }

    const destination = (destinationLat && destinationLng) 
      ? `${destinationLat},${destinationLng}` 
      : encodeURIComponent(address);

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyBOOflQXcbdbG22UscFvYLhwmx5TfM2sTc";
    const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${AGENCY_LAT},${AGENCY_LNG}&destinations=${destination}&key=${apiKey}`;

    let distanceKm = 0;
    try {
      const response = await fetch(googleUrl);
      const data = await response.json();
      
      if (data.status === "OK" && data.rows && data.rows[0].elements && data.rows[0].elements[0].status === "OK") {
        distanceKm = data.rows[0].elements[0].distance.value / 1000;
      } else {
        throw new Error("Impossible de calculer la distance avec Google Maps");
      }
    } catch (err) {
      console.error("Google Maps API error:", err.message);
      if (destinationLat && destinationLng) {
        // Fallback Haversine si on a les coordonnées
        distanceKm = getHaversineDistance(AGENCY_LAT, AGENCY_LNG, destinationLat, destinationLng) * 1.3;
      } else {
        return res.status(400).json({ message: "Adresse introuvable ou itinéraire routier impossible via Google Maps." });
      }
    }

    if (distanceKm > 100) {
      return res.status(400).json({ 
        message: `Désolé, nous ne livrons pas au-delà de 100 km de notre agence. (Distance calculée: ${distanceKm.toFixed(1)} km)`
      });
    }

    // Calcul des frais (1.5 DT / km, minimum 5 DT)
    const delivery_fee = Math.max(5, parseFloat((distanceKm * 1.5).toFixed(2)));
    const return_fee = delivery_fee; // même calcul pour la récupération
    const total_delivery_cost = parseFloat((delivery_fee + return_fee).toFixed(2));

    res.json({
      distance_km: parseFloat(distanceKm.toFixed(2)),
      delivery_fee,
      return_fee,
      total_delivery_cost,
      lat: destinationLat,
      lng: destinationLng
    });

  } catch (error) {
    console.error("CALCULATE DELIVERY ERROR:", error);
    res.status(500).json({ message: "Erreur serveur lors du calcul de livraison" });
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        rentals.id as rental_id,
        users.name as client_name,
        users.email as client_email,
        cars.brand as car_brand,
        cars.model as car_model,
        rentals.delivery_address,
        rentals.delivery_distance_km,
        rentals.delivery_fee,
        rentals.return_fee,
        rentals.delivery_status,
        rentals.return_status,
        rentals.start_date,
        rentals.end_date
      FROM rentals
      JOIN users ON rentals.user_id = users.id
      JOIN cars ON rentals.car_id = cars.id
      WHERE rentals.delivery_requested = true
      ORDER BY rentals.start_date ASC
      `
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET SCHEDULE ERROR:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération du planning" });
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { rental_id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'en_route', 'delivered'].includes(status)) {
      return res.status(400).json({ message: "Statut de livraison invalide" });
    }

    const updated = await pool.query(
      `UPDATE rentals SET delivery_status = $1 WHERE id = $2 RETURNING *`,
      [status, rental_id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Location introuvable" });
    }

    res.json({ message: "Statut de livraison mis à jour", rental: updated.rows[0] });
  } catch (error) {
    console.error("UPDATE DELIVERY STATUS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.updateReturnStatus = async (req, res) => {
  try {
    const { rental_id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'en_route', 'returned'].includes(status)) {
      return res.status(400).json({ message: "Statut de récupération invalide" });
    }

    const updated = await pool.query(
      `UPDATE rentals SET return_status = $1 WHERE id = $2 RETURNING *`,
      [status, rental_id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Location introuvable" });
    }

    res.json({ message: "Statut de récupération mis à jour", rental: updated.rows[0] });
  } catch (error) {
    console.error("UPDATE RETURN STATUS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

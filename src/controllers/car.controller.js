
const pool = require("../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { sendEmail } = require("../services/email.service");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });






exports.generateDescription = async (req, res) => {
  try {
    const { brand, model, price_per_day } = req.body;
    const prompt = `Rédige une description marketing percutante (100 mots max) pour ce véhicule à louer :
Marque : ${brand || 'Inconnue'}
Modèle : ${model || 'Inconnu'}
Prix par jour : ${price_per_day || '?'} DT
        
La description doit donner envie de louer la voiture. Réponds directement avec la description, sans introduction ni guillemets.`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    res.json({ description: response.text().trim() });
  } catch (error) {
    console.error("AI Gen Error:", error.message);
    res.status(500).json({ message: "Erreur lors de la génération IA" });
  }
};


exports.getCars = async (req, res) => {
  try {
    const { brand, available, maxPrice } = req.query;
    let query = "SELECT * FROM cars WHERE 1=1 AND (archived = false OR archived IS NULL)";
    const values = [];
    let i = 1;
    if (brand) { query += ` AND brand ILIKE $${i++}`; values.push(`%${brand}%`); }
    if (available !== undefined) { query += ` AND available = $${i++}`; values.push(available === "true"); }
    if (maxPrice) { query += ` AND price_per_day <= $${i++}`; values.push(Number(maxPrice)); }
    const cars = await pool.query(query, values);
    res.status(200).json(cars.rows);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.getCarById = async (req, res) => {
  try {
    const car = await pool.query(
      "SELECT id, brand, model, price_per_day, promotion_price, available, image, description, fuel_type, transmission FROM cars WHERE id=$1",
      [req.params.id]
    );
    if (!car.rows.length) return res.status(404).json({ message: "Car not found" });
    res.json(car.rows[0]);
  } catch { res.status(500).json({ message: "Server error" }); }
};



exports.addCar = async (req, res) => {
  try {
    const { brand, model, price_per_day, promotion_price, status, description, fuel_type, transmission } = req.body;
    if (!brand || !model || !price_per_day) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const isAvailable = status === 'unavailable' ? false : true;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const car = await pool.query(
      `INSERT INTO cars (brand, model, price_per_day, promotion_price, available, image, description, fuel_type, transmission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [brand, model, Number(price_per_day), promotion_price ? Number(promotion_price) : null, isAvailable, imageUrl, description || null, fuel_type || 'Essence', transmission || 'Manuelle']
    );

    const newCar = car.rows[0];
    res.status(201).json(newCar);



  } catch (error) {
    console.error("ADD CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const { brand, model, price_per_day, promotion_price, available, status, description, fuel_type, transmission } = req.body;

    let isAvailable = available;
    if (status !== undefined) isAvailable = (status === 'available');

    let imageUrl = undefined;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    // Check if setting to unavailable while car has an ongoing/confirmed rental
    let ongoingWarning = null;
    if (isAvailable === false || status === 'unavailable') {
      const activeRental = await pool.query(
        `SELECT end_date FROM rentals
         WHERE car_id = $1
           AND status IN ('ongoing', 'confirmed')
           AND end_date >= CURRENT_DATE
         ORDER BY end_date DESC
         LIMIT 1`,
        [id]
      );
      if (activeRental.rows.length > 0) {
        ongoingWarning = activeRental.rows[0].end_date;
      }
    }

    let qBase = `UPDATE cars SET
        brand=COALESCE($1,brand), model=COALESCE($2,model),
        price_per_day=COALESCE($3,price_per_day), available=COALESCE($4,available),
        description=COALESCE($5,description),
        fuel_type=COALESCE($6,fuel_type), transmission=COALESCE($7,transmission),
        image=COALESCE($9,image)`;
    
    const params = [brand ?? null, model ?? null, price_per_day !== undefined ? Number(price_per_day) : null, isAvailable !== undefined ? isAvailable : null, description ?? null, fuel_type ?? null, transmission ?? null, id, imageUrl ?? null];
    
    if (promotion_price !== undefined) {
      qBase += `, promotion_price=$10`;
      params.push(promotion_price ? Number(promotion_price) : null);
    }
    
    qBase += ` WHERE id=$8 RETURNING *`;
    
    const car = await pool.query(qBase, params);
    
    if (!car.rows.length) return res.status(404).json({ message: "Car not found" });

    res.status(200).json({
      ...car.rows[0],
      warning: ongoingWarning
        ? `Cette voiture est actuellement en location jusqu'au ${new Date(ongoingWarning).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`
        : null
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.deleteCar = async (req, res) => {
  const client = await pool.connect();
  try {
    const carId = req.params.id;
    await client.query("BEGIN");

    const rentals = await client.query("SELECT id FROM rentals WHERE car_id=$1", [carId]);
    const rentalIds = rentals.rows.map(r => r.id);

    if (rentalIds.length > 0) {
      await client.query("DELETE FROM facture WHERE rental_id = ANY($1::int[])", [rentalIds]);

      await client.query("DELETE FROM payments WHERE rental_id = ANY($1::int[])", [rentalIds]);

      await client.query("DELETE FROM rentals WHERE car_id=$1", [carId]);
    }

    await client.query("DELETE FROM reviews WHERE car_id=$1", [carId]);

    await client.query("DELETE FROM services WHERE car_id=$1", [carId]);

    const result = await client.query("DELETE FROM cars WHERE id=$1 RETURNING *", [carId]);

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Car not found" });
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Car deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DELETE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  } finally {
    client.release();
  }
};

exports.getRentedCars = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cars.id AS car_id, cars.brand, cars.model,
             rentals.start_date, rentals.end_date, users.email AS client_email
      FROM rentals
      JOIN cars ON cars.id=rentals.car_id
      JOIN users ON users.id=rentals.user_id
      ORDER BY rentals.start_date DESC`);
    res.json(result.rows);
  } catch { res.status(500).json({ message: "Server error" }); }
};

exports.getArchivedCars = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM cars WHERE archived = true ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET ARCHIVED CARS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.archiveCar = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check for active rentals (ongoing or confirmed future rentals)
    const activeRentals = await client.query(
      `SELECT id FROM rentals
       WHERE car_id = $1
         AND status IN ('ongoing', 'confirmed', 'awaiting_payment')
         AND end_date >= CURRENT_DATE`,
      [id]
    );

    if (activeRentals.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "active_rentals",
        count: activeRentals.rows.length
      });
    }

    // Mark unavailable + archived
    const result = await client.query(
      "UPDATE cars SET archived = true, available = false WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Car not found" });
    }

    await client.query("COMMIT");
    res.json({ message: "Car archived successfully", car: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("ARCHIVE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  } finally {
    client.release();
  }
};

exports.forceArchiveCar = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch affected clients before cancellation (to send emails)
    const affectedRentals = await client.query(
      `SELECT rentals.id AS rental_id, users.email, users.name, users.id AS user_id,
              rentals.start_date, rentals.end_date, rentals.total_price,
              cars.brand, cars.model
       FROM rentals
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE rentals.car_id = $1
         AND rentals.status IN ('ongoing', 'confirmed', 'awaiting_payment')`,
      [id]
    );

    // 2. Mark paid payments as pending refund BEFORE cancelling
    await client.query(
      `UPDATE payments SET refund_status = 'pending'
       WHERE rental_id IN (
         SELECT id FROM rentals
         WHERE car_id = $1
           AND status IN ('ongoing', 'confirmed', 'awaiting_payment')
       )
       AND status = 'paid'`,
      [id]
    );

    // 3. Cancel all active rentals
    await client.query(
      `UPDATE rentals SET status = 'cancelled'
       WHERE car_id = $1
         AND status IN ('ongoing', 'confirmed', 'awaiting_payment')`,
      [id]
    );

    // 4. Archive the car
    const result = await client.query(
      "UPDATE cars SET archived = true, available = false WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Car not found" });
    }

    await client.query("COMMIT");

    // 4. Send email notifications to affected clients (non-blocking)
    setImmediate(async () => {
      for (const r of affectedRentals.rows) {
        const startDateFr = new Date(r.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        const endDateFr = new Date(r.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { margin:0; background:#f8fafc; font-family:'Helvetica Neue',Arial,sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#fff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; }
  .header { background:linear-gradient(135deg,#1e293b,#0f172a); padding:40px 32px; text-align:center; }
  .icon { width:64px; height:64px; background:rgba(239,68,68,0.15); border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:28px; }
  .title { color:#fff; font-size:22px; font-weight:800; margin:0 0 6px; }
  .subtitle { color:#94a3b8; font-size:14px; margin:0; }
  .body { padding:32px; }
  .alert { background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:16px 20px; margin-bottom:24px; }
  .alert-title { color:#dc2626; font-size:14px; font-weight:700; margin:0 0 6px; }
  .alert-msg { color:#7f1d1d; font-size:13px; margin:0; line-height:1.6; }
  .booking-box { background:#f8fafc; border-radius:10px; padding:16px 20px; margin-bottom:24px; border:1px solid #e2e8f0; }
  .booking-row { display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px; }
  .booking-label { color:#64748b; }
  .booking-value { color:#0f172a; font-weight:700; }
  .info { color:#475569; font-size:13px; line-height:1.7; margin-bottom:24px; }
  .cta { display:block; background:#0f172a; color:#fff; text-decoration:none; text-align:center; padding:14px; border-radius:10px; font-weight:700; font-size:14px; }
  .footer { padding:20px 32px; text-align:center; border-top:1px solid #f1f5f9; color:#94a3b8; font-size:11px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="icon">⚠️</div>
      <div class="title">Réservation annulée</div>
      <div class="subtitle">BMZ Location vous informe d'une modification</div>
    </div>
    <div class="body">
      <div class="alert">
        <div class="alert-title">Votre réservation a été annulée</div>
        <div class="alert-msg">Nous sommes sincèrement désolés pour la gêne occasionnée. Le véhicule que vous aviez réservé n'est plus disponible dans notre flotte.</div>
      </div>
      <div class="booking-box">
        <div class="booking-row"><span class="booking-label">Véhicule</span><span class="booking-value">${r.brand} ${r.model}</span></div>
        <div class="booking-row"><span class="booking-label">Période</span><span class="booking-value">${startDateFr} → ${endDateFr}</span></div>
        <div class="booking-row"><span class="booking-label">Référence</span><span class="booking-value">#${String(r.rental_id).padStart(5, '0')}</span></div>
      </div>
      <p class="info">
        Si vous avez effectué un paiement pour cette réservation, un <strong>remboursement complet</strong> sera traité dans les <strong>3 à 5 jours ouvrables</strong>.<br><br>
        Nous vous invitons à choisir un autre véhicule disponible dans notre flotte.
      </p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/" class="cta">Voir nos véhicules disponibles →</a>
    </div>
    <div class="footer">BMZ Location — Nous nous excusons pour ce désagrément.</div>
  </div>
</div>
</body>
</html>`;

        try {
          const { sendEmail } = require('../services/email.service');
          await sendEmail({
            to: r.email,
            subject: `⚠️ Votre réservation BMZ a été annulée — ${r.brand} ${r.model}`,
            html,
          });
          console.log(`📧 Cancellation email sent to ${r.email}`);
        } catch (emailErr) {
          console.warn(`Email failed for ${r.email}:`, emailErr.message);
        }
      }
    });

    res.json({ message: "Car force-archived successfully", affected: affectedRentals.rows.length });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("FORCE ARCHIVE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  } finally {
    client.release();
  }
};

exports.unarchiveCar = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE cars SET archived = false, available = true WHERE id = $1 RETURNING *",
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Car not found" });
    res.json({ message: "Car unarchived successfully", car: result.rows[0] });
  } catch (error) {
    console.error("UNARCHIVE CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// AI YIELD MANAGEMENT
exports.getAIYieldAnalysis = async (req, res) => {
  try {
    // 1. Get stats for all unarchived cars
    const statsQuery = await pool.query(`
      SELECT 
        c.id, c.brand, c.model, c.price_per_day, c.promotion_price, c.available,
        COUNT(r.id) as total_rentals,
        MAX(r.end_date) as last_rental_end,
        COALESCE(SUM(r.total_price), 0) as total_revenue
      FROM cars c
      LEFT JOIN rentals r ON c.id = r.car_id AND r.status IN ('completed', 'ongoing', 'confirmed')
      WHERE (c.archived = false OR c.archived IS NULL)
      GROUP BY c.id
      ORDER BY total_rentals DESC
    `);

    const carsData = statsQuery.rows;

    const systemPrompt = `Tu es un expert en Yield Management (tarification dynamique) pour une agence de location de voitures.
Je vais te fournir les statistiques de l'agence. Tu dois analyser quelles voitures méritent une baisse de prix (promotion) pour booster les ventes, et quelles voitures peuvent voir leur tarif de base augmenter car elles sont très populaires.

Retourne EXACTEMENT un objet JSON valide (aucun blabla avant ni après) avec le format suivant:
[
  {
    "car_id": 1,
    "action": "decrease", // ou "increase"
    "suggested_price": 70, // le nouveau prix conseillé
    "reason": "Cette voiture n'a pas été louée récemment, une promotion de 10 DT est idéale pour attirer les clients."
  }
]
Veille à ce que le résultat soit exclusivement du JSON. Ne met pas de backticks \`\`\`.

Voici les données des voitures:
${JSON.stringify(carsData)}
`;

    const result = await geminiModel.generateContent(systemPrompt);
    const responseText = result.response.text().trim();
    
    // Clean up potential markdown blocks
    let jsonOutput = responseText;
    if (jsonOutput.startsWith('\`\`\`json')) {
      jsonOutput = jsonOutput.substring(7);
      if (jsonOutput.endsWith('\`\`\`')) jsonOutput = jsonOutput.substring(0, jsonOutput.length - 3);
    } else if (jsonOutput.startsWith('\`\`\`')) {
      jsonOutput = jsonOutput.substring(3);
      if (jsonOutput.endsWith('\`\`\`')) jsonOutput = jsonOutput.substring(0, jsonOutput.length - 3);
    }

    const suggestions = JSON.parse(jsonOutput);
    res.json(suggestions);
  } catch (err) {
    console.error("YIELD ANALYSIS ERROR:", err);
    res.status(500).json({ message: "Échec de l'analyse IA." });
  }
};

exports.applyAIPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, suggested_price } = req.body;
    
    let query = "";
    if (action === "decrease") {
      // Set promotion_price
      query = "UPDATE cars SET promotion_price = $1 WHERE id = $2 RETURNING *";
    } else if (action === "increase") {
      // Update base price and remove promotion
      query = "UPDATE cars SET price_per_day = $1, promotion_price = NULL WHERE id = $2 RETURNING *";
    } else {
      return res.status(400).json({ message: "Action invalide." });
    }

    const car = await pool.query(query, [suggested_price, id]);
    
    if (!car.rows.length) {
      return res.status(404).json({ message: "Voiture introuvable." });
    }

    res.json({
      message: "Prix mis à jour avec succès !",
      car: car.rows[0]
    });
  } catch (err) {
    console.error("APPLY AI PRICE ERROR:", err);
    res.status(500).json({ message: "Erreur lors de la mise à jour du prix." });
  }
};

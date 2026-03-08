
const pool = require("../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { sendEmail } = require("../services/email.service");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


const generateCarAnnouncement = async (car) => {
  const prompt = `Tu es le rédacteur marketing de "BMZ Location", une agence de location de voitures premium.
Rédige une annonce courte et percutante (3 phrases max) pour ce nouveau véhicule :

Marque : ${car.brand}
Modèle : ${car.model}
Prix par jour : ${car.price_per_day} DT

Style : enthousiaste, professionnel, engageant. Réponds directement avec l'annonce, sans introduction ni guillemets.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
};

   
 
const broadcastCarAnnouncement = async (car, announcement) => {
  try {
    const usersRes = await pool.query(
      "SELECT email, name FROM users WHERE role='client' ORDER BY RANDOM() LIMIT 50"
    );
    const users = usersRes.rows;
    if (users.length === 0) return;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin:0; background:#0f172a; font-family:'Helvetica Neue',Arial,sans-serif; }
    .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
    .card { background:#1e293b; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); }
    .header { position:relative; background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%); padding:40px 32px; text-align:center; overflow:hidden; }
    .header::before { content:''; position:absolute; top:-40px; right:-40px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle,#6366f133,transparent); }
    .badge { display:inline-block; background:#6366f1; color:#fff; font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; padding:4px 12px; border-radius:20px; margin-bottom:16px; }
    .car-name { color:#fff; font-size:28px; font-weight:900; margin:0 0 4px; letter-spacing:-0.02em; }
    .car-brand { color:#94a3b8; font-size:14px; margin:0; }
    .price-tag { display:inline-block; margin-top:16px; background:linear-gradient(135deg,#6366f1,#22d3ee); color:#fff; font-size:18px; font-weight:800; padding:8px 20px; border-radius:12px; }
    .body { padding:32px; }
    .announcement { color:#e2e8f0; font-size:15px; line-height:1.7; margin-bottom:24px; }
    .features { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
    .feature { background:#0f172a; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 14px; font-size:12px; color:#94a3b8; }
    .cta { display:block; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; text-decoration:none; text-align:center; padding:14px; border-radius:12px; font-weight:700; font-size:14px; }
    .footer { padding:20px 32px; text-align:center; border-top:1px solid rgba(255,255,255,0.06); }
    .footer p { color:#475569; font-size:11px; margin:0; }
    .ai-badge { display:inline-flex; align-items:center; gap:4px; background:#6366f111; border:1px solid #6366f133; color:#818cf8; font-size:10px; font-weight:600; padding:3px 8px; border-radius:6px; margin-bottom:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <div class="badge">🚗 Nouveau Véhicule</div>
        <div class="car-name">${car.model}</div>
        <div class="car-brand">${car.brand}</div>
        <div class="price-tag">À partir de ${car.price_per_day} DT/jour</div>
      </div>
      <div class="body">
        <div class="ai-badge">✨ Présenté par notre IA</div>
        <div class="announcement">${announcement.replace(/\n/g, '<br>')}</div>
        <div class="features">
          <div class="feature">✅ Disponible maintenant</div>
          <div class="feature">🔑 Réservation en ligne</div>
          <div class="feature">📋 Contrat instantané</div>
          <div class="feature">💳 Paiement sécurisé</div>
        </div>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/" class="cta">
          Réserver maintenant →
        </a>
      </div>
      <div class="footer">
        <p>BMZ Location — Vous recevez cet email car vous êtes client chez nous.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    // Envoi groupé (non-bloquant)
    const emailPromises = users.map(u =>
      sendEmail({
        to: u.email,
        subject: `🚗 Nouveau véhicule disponible : ${car.brand} ${car.model} — BMZ Location`,
        html,
      }).catch(err => console.warn(`Email failed for ${u.email}:`, err.message))
    );

    await Promise.allSettled(emailPromises);
    console.log(`📢 Annonce envoyée à ${users.length} clients.`);

  } catch (err) {
    console.error("Broadcast error:", err.message);
  }
};

   

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
    let query = "SELECT * FROM cars WHERE 1=1";
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
      "SELECT id, brand, model, price_per_day, available, image, description, fuel_type, transmission FROM cars WHERE id=$1",
      [req.params.id]
    );
    if (!car.rows.length) return res.status(404).json({ message: "Car not found" });
    res.json(car.rows[0]);
  } catch { res.status(500).json({ message: "Server error" }); }
};

   

exports.addCar = async (req, res) => {
  try {
    const { brand, model, price_per_day, status, description, fuel_type, transmission } = req.body;
    if (!brand || !model || !price_per_day) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const isAvailable = status === 'unavailable' ? false : true;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const car = await pool.query(
      `INSERT INTO cars (brand, model, price_per_day, available, image, description, fuel_type, transmission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [brand, model, Number(price_per_day), isAvailable, imageUrl, description || null, fuel_type || 'Essence', transmission || 'Manuelle']
    );

    const newCar = car.rows[0];
    res.status(201).json(newCar);

    // 🤖 Annonce IA en arrière-plan (non-bloquant)
    setImmediate(async () => {
      try {
        const announcement = await generateCarAnnouncement(newCar);
        console.log(`\n📣 Annonce IA générée pour ${brand} ${model}:\n${announcement}\n`);
        await broadcastCarAnnouncement(newCar, announcement);
      } catch (err) {
        console.warn("AI announcement failed:", err.message);
      }
    });

  } catch (error) {
    console.error("ADD CAR ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.updateCar = async (req, res) => {
  try {
    const { id } = req.params;
    const { brand, model, price_per_day, available, status, description, fuel_type, transmission } = req.body;

    let isAvailable = available;
    if (status !== undefined) isAvailable = (status === 'available');

    let imageUrl = undefined;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const car = await pool.query(
      `UPDATE cars SET
        brand=COALESCE($1,brand), model=COALESCE($2,model),
        price_per_day=COALESCE($3,price_per_day), available=COALESCE($4,available),
        description=COALESCE($5,description),
        fuel_type=COALESCE($6,fuel_type), transmission=COALESCE($7,transmission),
        image=COALESCE($9,image)
       WHERE id=$8 RETURNING *`,
      [brand ?? null, model ?? null, price_per_day !== undefined ? Number(price_per_day) : null, isAvailable !== undefined ? isAvailable : null, description ?? null, fuel_type ?? null, transmission ?? null, id, imageUrl ?? null]
    );
    if (!car.rows.length) return res.status(404).json({ message: "Car not found" });
    res.status(200).json(car.rows[0]);
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
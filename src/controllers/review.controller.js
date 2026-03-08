// ============================================================
// review.controller.js — avec auto-réponse email IA (Claude)
// ============================================================
const pool = require("../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { sendEmail } = require("../services/email.service");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * 🤖 Génère une réponse personnalisée via Claude
 */
/**
 * 🤖 Helper logic: Génère une réponse personnalisée via Gemini
 */
const generateReviewReply = async (reviewData) => {
  const { rating, comment, carBrand, carModel, clientName } = reviewData;

  const tone = rating >= 8 ? "enthousiaste et chaleureux"
    : rating >= 5 ? "professionnel et constructif"
      : "empathique et orienté solution";

  const prompt = `Tu es le responsable d'une agence de location de voitures premium "BMZ Location".
Un client vient de laisser un avis.

Client : ${clientName || "Client fidèle"}
Voiture : ${carBrand} ${carModel}
Note : ${rating}/10
Commentaire : "${comment || "Aucun commentaire"}"

Rédige une réponse ${tone}, courte (3-4 phrases max), personnalisée, en français.
Réponds directement, sans introduction ni guillemets.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
};

/**
 * 🤖 API: Génère une réponse personnalisée via Gemini (Admin Preview)
 */
exports.generateAiReply = async (req, res) => {
  try {
    const { rating, comment, car_brand, car_model, client_name } = req.body;
    const reply = await generateReviewReply({
      rating: Number(rating) || 5,
      comment,
      carBrand: car_brand,
      carModel: car_model,
      clientName: client_name
    });
    res.json({ reply });
  } catch (error) {
    console.error("GEN AI REPLY ERROR:", error);
    res.status(500).json({ message: "Erreur lors de la génération IA" });
  }
};

/**
 * 👀 GET REVIEWS FOR A CAR (VISITEUR)
 */
exports.getCarReviews = async (req, res) => {
  try {
    const { car_id } = req.params;

    const reviews = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.ai_reply, u.name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.car_id = $1
       ORDER BY r.created_at DESC`,
      [car_id]
    );

    res.json(reviews.rows);
  } catch (error) {
    console.error("GET REVIEWS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ⭐ ADD REVIEW + AUTO EMAIL REPLY (CLIENT)
 */
exports.addReview = async (req, res) => {
  try {
    const { car_id, rating, comment } = req.body;

    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });
    if (!car_id || rating === undefined) return res.status(400).json({ message: "Missing fields" });

    const ratingNumber = Number(rating);
    if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
      return res.status(400).json({ message: "Rating must be between 1 and 10" });
    }

    const user_id = req.user.id;

    // Vérifier location terminée
    const rental = await pool.query(
      `SELECT 1 FROM rentals WHERE user_id=$1 AND car_id=$2 AND end_date < NOW()`,
      [user_id, car_id]
    );
    if (rental.rows.length === 0) {
      return res.status(403).json({ message: "Review allowed only after completed rental" });
    }

    // Récupérer infos voiture + client
    const [carRes, userRes] = await Promise.all([
      pool.query("SELECT brand, model FROM cars WHERE id=$1", [car_id]),
      pool.query("SELECT name, email FROM users WHERE id=$1", [user_id]),
    ]);

    const car = carRes.rows[0] || {};
    const user = userRes.rows[0] || {};

    // 🤖 Générer réponse IA
    let aiReply = null;
    try {
      aiReply = await generateReviewReply({
        rating: ratingNumber,
        comment,
        carBrand: car.brand,
        carModel: car.model,
        clientName: user.name,
      });
    } catch (aiErr) {
      console.warn("AI reply failed (non-blocking):", aiErr.message);
    }

    // Insérer l'avis
    const review = await pool.query(
      `INSERT INTO reviews (user_id, car_id, rating, comment, ai_reply)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, car_id, ratingNumber, comment || null, aiReply]
    );

    // 📧 Envoyer email de remerciement + réponse IA
    if (user.email && aiReply) {
      const stars = "⭐".repeat(Math.round(ratingNumber / 2));
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin:0; background:#0f172a; font-family:'Helvetica Neue',Arial,sans-serif; }
    .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
    .card { background:#1e293b; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); }
    .header { background:linear-gradient(135deg,#6366f1,#22d3ee); padding:32px; text-align:center; }
    .header h1 { color:#fff; margin:0; font-size:22px; font-weight:800; }
    .header p { color:rgba(255,255,255,0.8); margin:6px 0 0; font-size:14px; }
    .body { padding:32px; }
    .stars { font-size:24px; margin-bottom:16px; }
    .rating-badge { display:inline-block; background:#6366f122; color:#818cf8; border:1px solid #6366f144; border-radius:20px; padding:4px 14px; font-size:13px; font-weight:700; margin-bottom:20px; }
    .comment-box { background:#0f172a; border-radius:10px; padding:16px; margin-bottom:20px; border-left:3px solid #6366f1; }
    .comment-box p { color:#94a3b8; font-size:13px; margin:0; font-style:italic; }
    .reply-box { background:linear-gradient(135deg,#6366f108,#22d3ee08); border:1px solid #6366f133; border-radius:10px; padding:20px; }
    .reply-box .label { font-size:10px; font-weight:700; color:#6366f1; letter-spacing:.1em; text-transform:uppercase; margin-bottom:8px; }
    .reply-box p { color:#e2e8f0; font-size:14px; margin:0; line-height:1.6; }
    .footer { padding:20px 32px; text-align:center; border-top:1px solid rgba(255,255,255,0.06); }
    .footer p { color:#475569; font-size:12px; margin:0; }
    .car-tag { font-size:12px; color:#22d3ee; background:#22d3ee11; border-radius:6px; padding:4px 10px; display:inline-block; margin-bottom:16px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <h1>🚗 BMZ Location</h1>
        <p>Merci pour votre avis, ${user.name || 'cher client'} !</p>
      </div>
      <div class="body">
        <div class="stars">${stars}</div>
        <div class="rating-badge">Note : ${ratingNumber}/10</div>
        <div class="car-tag">${car.brand || ''} ${car.model || ''}</div>
        ${comment ? `<div class="comment-box"><p>"${comment}"</p></div>` : ''}
        <div class="reply-box">
          <div class="label">🤖 Réponse de notre équipe</div>
          <p>${aiReply.replace(/\n/g, '<br>')}</p>
        </div>
      </div>
      <div class="footer">
        <p>BMZ Location — Votre partenaire de confiance pour la location de véhicules</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      await sendEmail({
        to: user.email,
        subject: `⭐ Merci pour votre avis — ${car.brand} ${car.model}`,
        html,
      }).catch(err => console.warn("Email send failed:", err.message));
    }

    res.status(201).json({
      ...review.rows[0],
      ai_reply: aiReply,
    });

  } catch (error) {
    console.error("ADD REVIEW ERROR:", error);
    if (error.code === "23505") return res.status(409).json({ message: "You already reviewed this car" });
    res.status(500).json({ message: "Server error", detail: error.message });
  }
};

/**
 * ✏️ UPDATE REVIEW
 */
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    let ratingValue = null;
    if (rating !== undefined) {
      ratingValue = Number(rating);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 10) {
        return res.status(400).json({ message: "Rating must be between 1 and 10" });
      }
    }
    const review = await pool.query(
      `UPDATE reviews SET rating=COALESCE($1,rating), comment=COALESCE($2,comment)
       WHERE id=$3 AND user_id=$4 RETURNING *`,
      [ratingValue, comment ?? null, id, req.user.id]
    );
    if (review.rows.length === 0) return res.status(404).json({ message: "Review not found" });
    res.json(review.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🗑️ DELETE REVIEW
 */
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM reviews WHERE id=$1 AND user_id=$2",
      [id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "Review not found" });
    res.json({ message: "Review deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📋 TOUS LES AVIS (ADMIN)
 */
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.ai_reply, u.name as user_name, c.brand, c.model
       FROM reviews r
       JOIN cars c ON c.id = r.car_id
       JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC`
    );
    res.json(reviews.rows);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ✅ CHECK ELIGIBILITY (CLIENT)
 */
exports.checkEligibility = async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.json({ eligible: false });
    const { car_id } = req.params;
    const user_id = req.user.id;
    const rental = await pool.query(
      `SELECT 1 FROM rentals WHERE user_id=$1 AND car_id=$2 AND end_date < NOW()`,
      [user_id, car_id]
    );
    res.json({ eligible: rental.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📧 SEND MANUAL REPLY (ADMIN)
 */
exports.sendManualReply = async (req, res) => {
  try {
    const { review_id, reply_text } = req.body;

    if (!review_id || !reply_text) {
      return res.status(400).json({ message: "Missing review_id or reply_text" });
    }

    // Récupérer les infos du client via l'avis
    const result = await pool.query(
      `SELECT u.email, u.name, c.brand, c.model, r.rating, r.comment
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN cars c ON c.id = r.car_id
       WHERE r.id = $1`,
      [review_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    const { email, name, brand, model, rating, comment } = result.rows[0];

    const stars = "⭐".repeat(Math.round(Number(rating) / 2));
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { background:#f8fafc; font-family:sans-serif; padding:20px; }
    .card { background:#fff; max-width:500px; margin:0 auto; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; }
    .header { background:#0f172a; color:#fff; padding:24px; text-align:center; }
    .body { padding:24px; color:#334155; }
    .quote { background:#f1f5f9; padding:12px; border-radius:8px; font-style:italic; margin:16px 0; border-left:4px solid #6366f1; }
    .reply { line-height:1.6; color:#1e293b; font-weight:500; }
    .footer { padding:16px; font-size:12px; color:#94a3b8; text-align:center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>BMZ Location</h1></div>
    <div class="body">
      <p>Bonjour <strong>${name}</strong>,</p>
      <p>Toute l'équipe vous remercie pour votre avis suite à votre location du véhicule <strong>${brand} ${model}</strong>.</p>
      <div class="quote">"${comment || 'Pas de commentaire'}" (${rating}/10)</div>
      <p class="reply">${reply_text.replace(/\n/g, '<br>')}</p>
      <p>À très bientôt,<br>L'équipe BMZ Location</p>
    </div>
    <div class="footer">Ceci est un email automatique, merci de ne pas y répondre.</div>
  </div>
</body>
</html>`;

    await sendEmail({
      to: email,
      subject: `Réponse à votre avis — BMZ Location`,
      html
    });

    // Optionnel : Enregistrer la réponse envoyée dans la BD
    await pool.query(
      "UPDATE reviews SET ai_reply = $1 WHERE id = $2",
      [reply_text, review_id]
    );

    res.json({ message: "Email envoyé avec succès" });
  } catch (error) {
    console.error("SEND MANUAL REPLY ERROR:", error);
    res.status(500).json({ message: "Erreur lors de l'envoi de l'email" });
  }
};
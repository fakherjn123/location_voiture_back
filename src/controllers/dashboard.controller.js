const pool = require("../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  
exports.getStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM cars) AS total_cars,
        (SELECT COUNT(*) FROM cars WHERE is_active = true) AS active_cars,
        (SELECT COUNT(*) FROM rentals) AS total_rentals,
        (SELECT COUNT(*) FROM rentals WHERE status = 'ongoing') AS ongoing_rentals,
        (SELECT COUNT(*) FROM rentals WHERE status = 'confirmed') AS confirmed_rentals,
        (SELECT COUNT(*) FROM users) AS total_users
    `);

    res.json({
      total_cars: Number(stats.rows[0].total_cars),
      active_cars: Number(stats.rows[0].active_cars),
      total_rentals: Number(stats.rows[0].total_rentals),
      ongoing_rentals: Number(stats.rows[0].ongoing_rentals),
      confirmed_rentals: Number(stats.rows[0].confirmed_rentals),
      total_users: Number(stats.rows[0].total_users),
    });

  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Erreur serveur dashboard" });
  }
};

   

exports.getFinancialStats = async (req, res) => {
  try {
    const financial = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM payments) AS total_payments,
        (SELECT COUNT(*) FROM payments WHERE status = 'paid') AS paid_payments,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'paid') AS total_revenue,
        (SELECT COALESCE(SUM(amount), 0)
         FROM payments
         WHERE status = 'paid'
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        ) AS current_month_revenue
    `);

    res.json({
      total_payments: Number(financial.rows[0].total_payments),
      paid_payments: Number(financial.rows[0].paid_payments),
      total_revenue: Number(financial.rows[0].total_revenue),
      current_month_revenue: Number(financial.rows[0].current_month_revenue),
    });

  } catch (error) {
    console.error("FINANCIAL DASHBOARD ERROR:", error);
    res.status(500).json({
      message: "Erreur serveur dashboard financier"
    });
  }
};

   
 
exports.getTopCars = async (req, res) => {
  try {
    const topCars = await pool.query(`
      SELECT cars.id, cars.brand, cars.model,
             COUNT(rentals.id) AS total_rentals
      FROM cars
      LEFT JOIN rentals ON rentals.car_id = cars.id
      GROUP BY cars.id
      ORDER BY total_rentals DESC
      LIMIT 5
    `);

    res.json(topCars.rows);

  } catch (error) {
    console.error("TOP CARS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur top cars" });
  }
};

   
 
exports.getAIInsights = async (req, res) => {
  try {
    // 1. Récupération des données métiers globales
    const carsData = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN available=true THEN 1 ELSE 0 END) as available FROM cars");
    const financials = await pool.query("SELECT COALESCE(SUM(amount),0) as revenue FROM payments WHERE status='paid' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)");
    const badReviews = await pool.query("SELECT rating, comment FROM reviews WHERE rating <= 3 ORDER BY created_at DESC LIMIT 3");

    const countTotal = carsData.rows[0].total;
    const countAvail = carsData.rows[0].available;
    const revenue = financials.rows[0].revenue;
    const strReviews = JSON.stringify(badReviews.rows);

    // 2. Préparation du Prompt
    const prompt = `Tu es l'Analyste Stratégique Expert de 'BMZ Location', une agence de location de voitures tunisienne.
Voici les données actuelles de l'agence pour ce mois :
- Nombre total de voitures: ${countTotal} (dont ${countAvail} disponibles actuellement).
- Revenu du mois en cours: ${revenue} TND.
- Derniers avis clients (s'il y en a) : ${strReviews}.

Ta mission : Analyse cette situation et fournis une analyse chiffrée.
Retourne UNIQUEMENT un objet JSON STRICT contenant exactement cette structure :
{
  "chartData": [
    { "name": "Mois Actuel", "revenue": [chiffre actuel], "target": [objectif fixé par toi], "occupancy": [taux d'occupation réel actuel tiré des chiffres, ex: 80] },
    { "name": "Dans 1 Mois", "revenue": [prévision IA prudente], "target": [objectif], "occupancy": [taux d'occupation prévu en %] },
    { "name": "Dans 2 Mois", "revenue": [prévision IA optimiste], "target": [objectif], "occupancy": [taux d'occupation prévu en %] }
  ],
  "insights": [
    { "title": "Titre action 1", "description": "Explication avec des chiffres (ex: '+15% attendu')" },
    { "title": "Titre action 2", "description": "Explication avec des chiffres" },
    { "title": "Titre action 3", "description": "Explication avec des chiffres" }
  ]
}
Ne fais aucune introduction ni conclusion, juste le JSON pur.`;

    // 3. Appel à Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const insights = JSON.parse(responseText);

    res.json({ insights });

  } catch (error) {
    console.error("AI INSIGHTS ERROR:", error);
    res.status(500).json({
      message: "Erreur lors de la génération IA",
      details: error.message
    });
  }
};

   

exports.getMonthlyHistory = async (req, res) => {
  try {
    const sql = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month_label,
        COALESCE(SUM(amount), 0) AS revenue,
        COUNT(*) AS payment_count
      FROM payments
      WHERE status = 'paid'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months')
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `;
    const result = await pool.query(sql);
    res.json(result.rows.map(r => ({
      month: r.month,
      month_label: r.month_label,
      revenue: Number(r.revenue),
      payment_count: Number(r.payment_count),
    })));
  } catch (error) {
    console.error('MONTHLY HISTORY ERROR:', error);
    res.status(500).json({ message: 'Erreur serveur historique mensuel' });
  }
};
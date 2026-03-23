const pool = require("../config/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const jwt = require("jsonwebtoken");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

exports.getRecommendation = async (req, res) => {
  try {
    let userId = null;
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (err) {}
    }

    // 1. Get user's last rental
    let lastCar = null;
    if (userId) {
      const lastRentalResult = await pool.query(
        `SELECT cars.brand, cars.model, cars.price_per_day, cars.fuel_type, cars.transmission
         FROM rentals
         JOIN cars ON cars.id = rentals.car_id
         WHERE rentals.user_id = $1 AND rentals.start_date <= CURRENT_DATE
         ORDER BY rentals.start_date DESC
         LIMIT 1`,
        [userId]
      );
      lastCar = lastRentalResult.rows[0];
    }

    // 2. Get available cars currently
    const availableCarsResult = await pool.query(
      "SELECT id, brand, model, price_per_day, fuel_type, transmission, image FROM cars WHERE available = true"
    );

    if (availableCarsResult.rows.length === 0) {
      return res.status(404).json({ message: "Aucune voiture disponible actuellement." });
    }

    const availableCars = availableCarsResult.rows;

    // 3. Prepare AI Prompt
    let prompt = "";
    if (lastCar) {
      prompt = `Tu es l'agent de recommandation de "BMZ Location", une agence de location premium.
Un client a récemment loué ceci chez nous : ${lastCar.brand} ${lastCar.model} (${lastCar.price_per_day} DT/jour).

Voici la liste de nos véhicules actuellement DISPONIBLES (ID, Marque, Modèle, Prix/jour) :
${availableCars.map(c => `- ID: ${c.id} | ${c.brand} ${c.model} (${c.price_per_day} DT)`).join('\n')}

INSTRUCTIONS :
1. Choisis LE MEILLEUR véhicule de cette liste à recommander à ce client, en te basant sur ses goûts (gamme similaire, upgrade logique, ou style de conduite similaire).
2. Ne choisis QUE parmi les identifiants (ID) fournis dans la liste des voitures disponibles.
3. Rédige une phrase marketing très courte (2 phrases max) adressée directement au client pour le convaincre de louer ce véhicule spécifique en lui rappelant subtilement son ancienne location.

RÉPOND UNIQUEMENT SOUS CE FORMAT JSON STRICT (aucun autre texte, pas de guillemets markdown \`\`\`) :
{
  "recommended_car_id": [ID_CHOISI],
  "message": "[TA_PHRASE_MARKETING]"
}`;
    } else {
       prompt = `Tu es l'agent de recommandation de "BMZ Location", une agence de location premium.
Un nouveau client cherche un véhicule chez nous.

Voici la liste de nos véhicules actuellement DISPONIBLES (ID, Marque, Modèle, Prix/jour) :
${availableCars.map(c => `- ID: ${c.id} | ${c.brand} ${c.model} (${c.price_per_day} DT)`).join('\n')}

INSTRUCTIONS :
1. Choisis LE véhicule de notre flotte le plus attractif ou populaire (le "Coup de cœur" de l'agence).
2. Ne choisis QUE parmi les identifiants (ID) fournis dans la liste des voitures disponibles.
3. Rédige une phrase marketing très courte (2 phrases max) adressée directement au client pour lui donner envie de louer ce véhicule exceptionnel.

RÉPOND UNIQUEMENT SOUS CE FORMAT JSON STRICT (aucun autre texte, pas de guillemets markdown \`\`\`) :
{
  "recommended_car_id": [ID_CHOISI],
  "message": "[TA_PHRASE_MARKETING]"
}`;
    }

    // 4. Call Gemini AI
    const result = await geminiModel.generateContent(prompt);
    const responseText = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();

    let aiData;
    try {
      aiData = JSON.parse(responseText);
    } catch (parseError) {
       console.error("AI JSON Parse Error:", responseText);
       // Fallback to random car if AI fails to return JSON
       const randomCar = availableCars[Math.floor(Math.random() * availableCars.length)];
       return res.status(200).json({
         recommendation: randomCar,
         message: "Découvrez cette superbe voiture disponible dès aujourd'hui dans notre agence."
       });
    }

    // 5. Match AI choice with DB Car
    const recommendedCar = availableCars.find(c => String(c.id) === String(aiData.recommended_car_id));

    if (!recommendedCar) {
       const randomCar = availableCars[0];
       return res.status(200).json({
         recommendation: randomCar,
         message: aiData.message || "Notre recommandation du jour pour vous."
       });
    }

    return res.status(200).json({
      recommendation: recommendedCar,
      message: aiData.message
    });

  } catch (err) {
    console.error("RECOMMENDATION ERROR:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la génération de la recommandation."
    });
  }
};

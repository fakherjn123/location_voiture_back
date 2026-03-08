const pool = require("../config/db");

   

exports.getServices = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT 
        s.id,
        c.brand || ' ' || c.model AS vehicle,
        COALESCE(c.status, 'disponible') AS plate,
        s.service_type AS type,
        s.details,
        TO_CHAR(s.due_date, 'DD Mon YYYY') AS due_date,
        CASE 
          WHEN s.due_date < NOW() THEN 'Dépassé'
          ELSE 'Dans ' || GREATEST(EXTRACT(DAY FROM (s.due_date - NOW()))::int, 0) || ' jours'
        END AS due_in,
        s.status,
        s.estimated_cost AS cost
      FROM services s
      JOIN cars c ON c.id = s.car_id
      ORDER BY s.due_date ASC
    `);
        res.json(result.rows);
    } catch (err) {
        console.error("GET SERVICES ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

   

exports.createService = async (req, res) => {
    try {
        const { car_id, service_type, details, due_date, estimated_cost } = req.body;
        const result = await pool.query(
            `INSERT INTO services (car_id, service_type, details, due_date, estimated_cost, status)
       VALUES ($1, $2, $3, $4, $5, 'En attente')
       RETURNING *`,
            [car_id, service_type, details, due_date, estimated_cost]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("CREATE SERVICE ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

   

exports.updateServiceStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            `UPDATE services SET status = $1 WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Service introuvable" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error("UPDATE SERVICE STATUS ERROR:", err.message);
        res.status(500).json({ message: "Erreur serveur", detail: err.message });
    }
};

   

exports.getAlerts = async (req, res) => {
    try {
        let alerts = [];

        const servicesAlerts = await pool.query(`
            SELECT 
                s.car_id AS car_id,
                c.brand || ' ' || c.model AS vehicle,
                COALESCE(c.status, '—') AS plate,
                CASE
                WHEN s.due_date < NOW() THEN 'CRITIQUE'
                WHEN s.due_date - NOW() < INTERVAL '15 days' THEN 'Bientôt'
                ELSE 'OK'
                END AS severity,
                s.service_type AS alert_type,
                s.due_date AS expiry_date
            FROM services s
            JOIN cars c ON c.id = s.car_id
            WHERE s.status != 'Terminé'
                AND s.due_date < NOW() + INTERVAL '15 days'
            ORDER BY s.due_date ASC
        `);
        alerts = [...alerts, ...servicesAlerts.rows];

        // 2. Vérifier si la colonne insurance_expiry existe
        const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cars' AND column_name = 'insurance_expiry'
    `);

        if (colCheck.rows.length > 0) {
            const result = await pool.query(`
      SELECT 
        c.id AS car_id,
        c.brand || ' ' || c.model AS vehicle,
        COALESCE(c.status, '—') AS plate,
        CASE
          WHEN c.insurance_expiry < NOW() THEN 'CRITIQUE'
          WHEN c.insurance_expiry - NOW() < INTERVAL '30 days' THEN 'Bientôt'
          ELSE 'OK'
        END AS severity,
        'Assurance' AS alert_type,
        c.insurance_expiry AS expiry_date
      FROM cars c
      WHERE c.insurance_expiry IS NOT NULL
        AND c.insurance_expiry < NOW() + INTERVAL '30 days'
      ORDER BY c.insurance_expiry ASC
    `);
            alerts = [...alerts, ...result.rows];
        }

        res.json(alerts);
    } catch (err) {
        console.error("GET ALERTS ERROR:", err.message);
        // En cas d'erreur, retourner tableau vide plutôt que 500
        res.json([]);
    }
};

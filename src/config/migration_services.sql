-- ===========================================
-- Migration : Table services (entretien/maintenance)
-- Créez cette table une seule fois dans votre base PFE
-- ===========================================

-- S'assurer que la colonne insurance_expiry existe sur la table cars
ALTER TABLE cars ADD COLUMN IF NOT EXISTS insurance_expiry TIMESTAMP;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS technical_control_expiry TIMESTAMP;

-- Table principale des entretiens
CREATE TABLE IF NOT EXISTS services (
  id            SERIAL PRIMARY KEY,
  car_id        INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  service_type  VARCHAR(255) NOT NULL,          -- Ex: "Vidange moteur", "Révision 60 000 km"
  details       VARCHAR(500),                   -- Ex: "Filtres, Bougies, Freins"
  due_date      TIMESTAMP NOT NULL,             -- Date d'échéance
  status        VARCHAR(50) DEFAULT 'En attente', -- 'En attente', 'Planifié', 'RDV Confirmé', 'Terminé'
  estimated_cost NUMERIC(10,2),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Données de test (facultatif - pour voir quelque chose dans la page)
-- Commentez ou supprimez ces lignes si vous avez déjà des données
-- INSERT INTO services (car_id, service_type, details, due_date, estimated_cost, status)
-- SELECT id, 'Révision annuelle', 'Filtres, bougies, freins', NOW() + INTERVAL '4 days', 450.00, 'Planifié'
-- FROM cars LIMIT 1;


ALTER TABLE cars ADD COLUMN IF NOT EXISTS insurance_expiry TIMESTAMP;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS technical_control_expiry TIMESTAMP;

CREATE TABLE IF NOT EXISTS services (
  id            SERIAL PRIMARY KEY,
  car_id        INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  service_type  VARCHAR(255) NOT NULL,          
  details       VARCHAR(500),                   
  due_date      TIMESTAMP NOT NULL,             
  status        VARCHAR(50) DEFAULT 'En attente', 
  estimated_cost NUMERIC(10,2),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- 1. Table des Codes Promo
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,
  expiration_date TIMESTAMP,
  usage_limit INTEGER DEFAULT NULL,
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Modification de la table Rentals pour inclure le code promo
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- 3. Table des Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table des Inspections (État des lieux bilatéral)
CREATE TABLE IF NOT EXISTS inspections (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  type VARCHAR(50) CHECK (type IN ('check_in', 'check_out')),
  fuel_level INTEGER, -- Pourcentage (ex: 100 pour plein)
  mileage INTEGER,
  exterior_notes TEXT,
  interior_notes TEXT,
  photos JSONB DEFAULT '[]', -- Liste des URLs d'images
  client_signature BOOLEAN DEFAULT false,
  admin_signature BOOLEAN DEFAULT false,
  client_id INTEGER REFERENCES users(id),
  admin_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

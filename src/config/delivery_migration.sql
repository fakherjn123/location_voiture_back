-- Migration pour ajouter la fonctionnalité de livraison (Door-to-Door)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_requested BOOLEAN DEFAULT false;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_fee NUMERIC DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_status VARCHAR(50) DEFAULT 'pending';

-- Migration: Add refund_status and refund_amount to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) DEFAULT NULL;
-- Values: NULL (normal), 'pending' (refund requested), 'refunded' (refund processed)

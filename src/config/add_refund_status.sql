-- Migration: Add refund_status column to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT NULL;
-- Values: NULL (normal), 'pending' (refund requested), 'refunded' (refund processed)

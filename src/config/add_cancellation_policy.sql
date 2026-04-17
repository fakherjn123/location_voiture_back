-- Migration: Politique d'annulation avec remboursement
ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_percentage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

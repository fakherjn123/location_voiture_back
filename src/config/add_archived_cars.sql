-- Migration: Add archived column to cars table
ALTER TABLE cars ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

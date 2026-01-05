-- Add reconciliation_note column to positions table for tracking stuck positions
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;
-- First add 'orphaned' to position_status enum
ALTER TYPE position_status ADD VALUE IF NOT EXISTS 'orphaned';
-- Add 'closing' status to position_status enum
ALTER TYPE position_status ADD VALUE IF NOT EXISTS 'closing';

-- Reopen orphaned positions (closed but never sold - no exit_order_id)
-- Update trades first
UPDATE trades 
SET status = 'open', closed_at = NULL
WHERE exit_order_id IS NULL 
  AND status = 'closed'
  AND is_paper_trade = false;

-- Update positions linked to those trades
UPDATE positions 
SET status = 'open', updated_at = NOW()
WHERE trade_id IN (
  SELECT id FROM trades
  WHERE exit_order_id IS NULL 
    AND status = 'open'
    AND is_paper_trade = false
)
AND status = 'closed';
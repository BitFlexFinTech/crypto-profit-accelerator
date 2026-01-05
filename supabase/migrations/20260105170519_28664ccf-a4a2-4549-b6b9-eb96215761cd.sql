-- Mark ghost positions (those with "Position not found" reconciliation notes) as orphaned
UPDATE positions 
SET status = 'orphaned',
    take_profit_status = 'cancelled',
    updated_at = now()
WHERE status = 'open' 
AND reconciliation_note LIKE '%Position not found on%';
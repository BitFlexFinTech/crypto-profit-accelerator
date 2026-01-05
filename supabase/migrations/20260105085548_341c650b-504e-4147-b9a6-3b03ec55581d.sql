-- Clean up existing duplicates (keep most recent by updated_at)
DELETE FROM balances a 
USING balances b 
WHERE a.id < b.id 
  AND a.exchange_id = b.exchange_id 
  AND a.currency = b.currency;

-- Add unique constraint to prevent duplicate balance rows
ALTER TABLE balances 
ADD CONSTRAINT unique_exchange_currency 
UNIQUE (exchange_id, currency);
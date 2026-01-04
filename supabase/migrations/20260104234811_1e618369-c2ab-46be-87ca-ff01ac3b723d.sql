-- Add columns to track real exchange order IDs for reconciliation
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS entry_order_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS exit_order_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT FALSE;

ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS entry_order_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS exit_order_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN public.positions.entry_order_id IS 'Real exchange order ID for entry order';
COMMENT ON COLUMN public.positions.exit_order_id IS 'Real exchange order ID for exit/close order';
COMMENT ON COLUMN public.positions.is_live IS 'True if executed on real exchange, false if paper/simulated';
COMMENT ON COLUMN public.trades.entry_order_id IS 'Real exchange order ID for entry order';
COMMENT ON COLUMN public.trades.exit_order_id IS 'Real exchange order ID for exit/close order';
COMMENT ON COLUMN public.trades.is_live IS 'True if executed on real exchange, false if paper/simulated';
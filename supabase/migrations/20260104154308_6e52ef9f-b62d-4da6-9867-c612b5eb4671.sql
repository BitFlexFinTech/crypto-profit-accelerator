-- Add take-profit timing columns to positions table
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS take_profit_placed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS take_profit_filled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add take-profit timing columns to trades table for historical analysis
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS tp_placed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp_filled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tp_price NUMERIC DEFAULT NULL;
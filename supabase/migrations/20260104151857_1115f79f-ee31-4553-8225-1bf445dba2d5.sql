-- Add take-profit order tracking columns to positions table (if not already added)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'positions' AND column_name = 'take_profit_order_id') THEN
    ALTER TABLE public.positions ADD COLUMN take_profit_order_id TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'positions' AND column_name = 'take_profit_price') THEN
    ALTER TABLE public.positions ADD COLUMN take_profit_price NUMERIC(20,8) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'positions' AND column_name = 'take_profit_status') THEN
    ALTER TABLE public.positions ADD COLUMN take_profit_status TEXT DEFAULT NULL;
  END IF;
END $$;

-- Enable realtime for trades and balances tables (positions already enabled)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'balances') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.balances;
  END IF;
END $$;
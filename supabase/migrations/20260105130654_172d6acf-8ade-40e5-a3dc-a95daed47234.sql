-- Enable REPLICA IDENTITY FULL for complete row data in realtime events (if not already set)
ALTER TABLE public.positions REPLICA IDENTITY FULL;
ALTER TABLE public.balances REPLICA IDENTITY FULL;
ALTER TABLE public.trades REPLICA IDENTITY FULL;
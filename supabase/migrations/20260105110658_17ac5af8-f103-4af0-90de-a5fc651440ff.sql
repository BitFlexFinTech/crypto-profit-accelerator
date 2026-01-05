-- Create trading_loop_lock table for preventing overlapping executions
CREATE TABLE IF NOT EXISTS public.trading_loop_lock (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert the single lock row
INSERT INTO public.trading_loop_lock (id, locked_at, locked_by)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.trading_loop_lock ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role can manage lock" 
ON public.trading_loop_lock
FOR ALL
USING (true)
WITH CHECK (true);
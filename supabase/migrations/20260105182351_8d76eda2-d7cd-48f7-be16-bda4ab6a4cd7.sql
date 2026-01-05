-- Create vps_deployments table for tracking VPS instances
CREATE TABLE public.vps_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  provider TEXT NOT NULL CHECK (provider IN ('digitalocean', 'aws', 'oracle', 'gcp')),
  region TEXT NOT NULL,
  region_city TEXT,
  instance_id TEXT,
  ip_address TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'running', 'stopped', 'error')),
  websocket_endpoint TEXT,
  websocket_connected BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ,
  error_message TEXT,
  monthly_cost_estimate NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vps_deployments ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on vps_deployments" 
ON public.vps_deployments 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_vps_deployments_updated_at
BEFORE UPDATE ON public.vps_deployments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
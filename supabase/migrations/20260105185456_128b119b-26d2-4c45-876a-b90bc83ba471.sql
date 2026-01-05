-- PART 1: Reset all transactional data to zero
TRUNCATE TABLE trades CASCADE;
TRUNCATE TABLE positions CASCADE;
TRUNCATE TABLE balances CASCADE;
TRUNCATE TABLE daily_stats CASCADE;
TRUNCATE TABLE notifications CASCADE;
TRUNCATE TABLE vps_deployments CASCADE;

-- Reset the trading loop lock
UPDATE trading_loop_lock SET locked_at = NULL, locked_by = NULL WHERE id = 1;

-- PART 2: Create VPS scaling rules table
CREATE TABLE vps_scaling_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  volatility_threshold NUMERIC DEFAULT 3.0,
  max_instances INTEGER DEFAULT 3,
  cooldown_minutes INTEGER DEFAULT 30,
  scale_up_count INTEGER DEFAULT 1,
  last_scale_at TIMESTAMPTZ,
  is_enabled BOOLEAN DEFAULT false,
  provider TEXT DEFAULT 'digitalocean',
  region TEXT DEFAULT 'nyc1',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on vps_scaling_rules
ALTER TABLE vps_scaling_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on vps_scaling_rules"
ON vps_scaling_rules
FOR ALL
USING (true)
WITH CHECK (true);

-- PART 3: Create VPS latency logs table
CREATE TABLE vps_latency_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vps_deployment_id UUID REFERENCES vps_deployments(id) ON DELETE CASCADE,
  latency_ms INTEGER NOT NULL,
  exchange TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient time-series queries
CREATE INDEX idx_latency_logs_time ON vps_latency_logs(vps_deployment_id, recorded_at DESC);

-- Enable RLS on vps_latency_logs
ALTER TABLE vps_latency_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on vps_latency_logs"
ON vps_latency_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- PART 4: Add deployment history columns to vps_deployments
ALTER TABLE vps_deployments ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
ALTER TABLE vps_deployments ADD COLUMN IF NOT EXISTS total_uptime_seconds INTEGER DEFAULT 0;
ALTER TABLE vps_deployments ADD COLUMN IF NOT EXISTS total_trades_executed INTEGER DEFAULT 0;
ALTER TABLE vps_deployments ADD COLUMN IF NOT EXISTS total_cost_incurred NUMERIC DEFAULT 0;
ALTER TABLE vps_deployments ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- Enable realtime for latency logs
ALTER PUBLICATION supabase_realtime ADD TABLE vps_latency_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE vps_scaling_rules;
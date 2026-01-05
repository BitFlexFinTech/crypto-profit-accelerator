-- Add latency threshold columns to bot_settings
ALTER TABLE public.bot_settings
ADD COLUMN IF NOT EXISTS latency_threshold_binance integer DEFAULT 1200,
ADD COLUMN IF NOT EXISTS latency_threshold_okx integer DEFAULT 1200,
ADD COLUMN IF NOT EXISTS latency_threshold_bybit integer DEFAULT 1200,
ADD COLUMN IF NOT EXISTS latency_exit_threshold_binance integer DEFAULT 800,
ADD COLUMN IF NOT EXISTS latency_exit_threshold_okx integer DEFAULT 800,
ADD COLUMN IF NOT EXISTS latency_exit_threshold_bybit integer DEFAULT 800,
ADD COLUMN IF NOT EXISTS safe_mode_enabled boolean DEFAULT true;
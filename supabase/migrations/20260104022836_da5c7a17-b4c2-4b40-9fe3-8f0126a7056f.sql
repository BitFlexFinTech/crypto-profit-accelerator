-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum types
CREATE TYPE public.exchange_name AS ENUM ('binance', 'okx', 'nexo', 'bybit', 'kucoin', 'hyperliquid');
CREATE TYPE public.trade_type AS ENUM ('spot', 'futures');
CREATE TYPE public.position_direction AS ENUM ('long', 'short');
CREATE TYPE public.position_status AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE public.order_status AS ENUM ('pending', 'filled', 'partially_filled', 'cancelled', 'failed');
CREATE TYPE public.notification_type AS ENUM ('trade_opened', 'trade_closed', 'profit_target_hit', 'error', 'warning', 'info');

-- Bot settings table (global settings per user)
CREATE TABLE public.bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  is_paper_trading BOOLEAN DEFAULT true,
  is_bot_running BOOLEAN DEFAULT false,
  min_order_size DECIMAL(10,2) DEFAULT 333.00,
  max_order_size DECIMAL(10,2) DEFAULT 450.00,
  spot_profit_target DECIMAL(10,2) DEFAULT 1.00,
  futures_profit_target DECIMAL(10,2) DEFAULT 3.00,
  daily_loss_limit DECIMAL(10,2) DEFAULT 50.00,
  max_open_positions INTEGER DEFAULT 10,
  ai_aggressiveness TEXT DEFAULT 'balanced' CHECK (ai_aggressiveness IN ('conservative', 'balanced', 'aggressive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Exchanges table (which exchanges user has enabled)
CREATE TABLE public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exchange exchange_name NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  is_connected BOOLEAN DEFAULT false,
  spot_enabled BOOLEAN DEFAULT true,
  futures_enabled BOOLEAN DEFAULT false,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  passphrase_encrypted TEXT,
  last_balance_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exchange)
);

-- Balances table (track USDT balance per exchange)
CREATE TABLE public.balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exchange_id UUID REFERENCES public.exchanges(id) ON DELETE CASCADE,
  currency TEXT DEFAULT 'USDT',
  available DECIMAL(20,8) DEFAULT 0,
  locked DECIMAL(20,8) DEFAULT 0,
  total DECIMAL(20,8) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trades table (complete trade history)
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  exchange_id UUID REFERENCES public.exchanges(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  trade_type trade_type NOT NULL,
  direction position_direction NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  exit_price DECIMAL(20,8),
  quantity DECIMAL(20,8) NOT NULL,
  order_size_usd DECIMAL(10,2) NOT NULL,
  leverage INTEGER DEFAULT 1,
  entry_fee DECIMAL(20,8) DEFAULT 0,
  exit_fee DECIMAL(20,8) DEFAULT 0,
  funding_fee DECIMAL(20,8) DEFAULT 0,
  gross_profit DECIMAL(20,8),
  net_profit DECIMAL(20,8),
  status position_status DEFAULT 'open',
  is_paper_trade BOOLEAN DEFAULT true,
  ai_score DECIMAL(5,2),
  ai_reasoning TEXT,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Active positions table (for real-time monitoring)
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  exchange_id UUID REFERENCES public.exchanges(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  trade_type trade_type NOT NULL,
  direction position_direction NOT NULL,
  entry_price DECIMAL(20,8) NOT NULL,
  current_price DECIMAL(20,8),
  quantity DECIMAL(20,8) NOT NULL,
  order_size_usd DECIMAL(10,2) NOT NULL,
  leverage INTEGER DEFAULT 1,
  unrealized_pnl DECIMAL(20,8) DEFAULT 0,
  profit_target DECIMAL(20,8) NOT NULL,
  status position_status DEFAULT 'open',
  is_paper_trade BOOLEAN DEFAULT true,
  opened_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily stats table (for P&L charts)
CREATE TABLE public.daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  gross_profit DECIMAL(20,8) DEFAULT 0,
  total_fees DECIMAL(20,8) DEFAULT 0,
  net_profit DECIMAL(20,8) DEFAULT 0,
  open_price DECIMAL(20,8),
  high_price DECIMAL(20,8),
  low_price DECIMAL(20,8),
  close_price DECIMAL(20,8),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Setup wizard progress table
CREATE TABLE public.setup_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  is_completed BOOLEAN DEFAULT false,
  current_step INTEGER DEFAULT 1,
  exchanges_connected TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setup_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bot_settings
CREATE POLICY "Users can view own settings" ON public.bot_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own settings" ON public.bot_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.bot_settings FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for exchanges
CREATE POLICY "Users can view own exchanges" ON public.exchanges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own exchanges" ON public.exchanges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exchanges" ON public.exchanges FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exchanges" ON public.exchanges FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for balances
CREATE POLICY "Users can view own balances" ON public.balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own balances" ON public.balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own balances" ON public.balances FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for trades
CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for positions
CREATE POLICY "Users can view own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for daily_stats
CREATE POLICY "Users can view own daily stats" ON public.daily_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own daily stats" ON public.daily_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily stats" ON public.daily_stats FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for setup_progress
CREATE POLICY "Users can view own setup progress" ON public.setup_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own setup progress" ON public.setup_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own setup progress" ON public.setup_progress FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime for positions (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.balances;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_bot_settings_updated_at BEFORE UPDATE ON public.bot_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exchanges_updated_at BEFORE UPDATE ON public.exchanges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_setup_progress_updated_at BEFORE UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
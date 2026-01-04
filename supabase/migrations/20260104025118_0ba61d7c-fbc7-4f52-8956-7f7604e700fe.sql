-- Update RLS policies for single-user mode (no authentication required)
-- Remove user_id requirements and allow all operations

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own settings" ON public.bot_settings;
DROP POLICY IF EXISTS "Users can create own settings" ON public.bot_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.bot_settings;

DROP POLICY IF EXISTS "Users can view own exchanges" ON public.exchanges;
DROP POLICY IF EXISTS "Users can create own exchanges" ON public.exchanges;
DROP POLICY IF EXISTS "Users can update own exchanges" ON public.exchanges;
DROP POLICY IF EXISTS "Users can delete own exchanges" ON public.exchanges;

DROP POLICY IF EXISTS "Users can view own balances" ON public.balances;
DROP POLICY IF EXISTS "Users can create own balances" ON public.balances;
DROP POLICY IF EXISTS "Users can update own balances" ON public.balances;

DROP POLICY IF EXISTS "Users can view own trades" ON public.trades;
DROP POLICY IF EXISTS "Users can create own trades" ON public.trades;
DROP POLICY IF EXISTS "Users can update own trades" ON public.trades;

DROP POLICY IF EXISTS "Users can view own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can create own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;
DROP POLICY IF EXISTS "Users can delete own positions" ON public.positions;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can view own daily stats" ON public.daily_stats;
DROP POLICY IF EXISTS "Users can create own daily stats" ON public.daily_stats;
DROP POLICY IF EXISTS "Users can update own daily stats" ON public.daily_stats;

DROP POLICY IF EXISTS "Users can view own setup progress" ON public.setup_progress;
DROP POLICY IF EXISTS "Users can create own setup progress" ON public.setup_progress;
DROP POLICY IF EXISTS "Users can update own setup progress" ON public.setup_progress;

-- Create permissive policies for single-user mode
-- bot_settings
CREATE POLICY "Allow all operations on bot_settings" ON public.bot_settings FOR ALL USING (true) WITH CHECK (true);

-- exchanges
CREATE POLICY "Allow all operations on exchanges" ON public.exchanges FOR ALL USING (true) WITH CHECK (true);

-- balances
CREATE POLICY "Allow all operations on balances" ON public.balances FOR ALL USING (true) WITH CHECK (true);

-- trades
CREATE POLICY "Allow all operations on trades" ON public.trades FOR ALL USING (true) WITH CHECK (true);

-- positions
CREATE POLICY "Allow all operations on positions" ON public.positions FOR ALL USING (true) WITH CHECK (true);

-- notifications
CREATE POLICY "Allow all operations on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- daily_stats
CREATE POLICY "Allow all operations on daily_stats" ON public.daily_stats FOR ALL USING (true) WITH CHECK (true);

-- setup_progress
CREATE POLICY "Allow all operations on setup_progress" ON public.setup_progress FOR ALL USING (true) WITH CHECK (true);

-- Make user_id columns nullable for single-user mode
ALTER TABLE public.bot_settings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.exchanges ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.balances ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.trades ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.positions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.daily_stats ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.setup_progress ALTER COLUMN user_id DROP NOT NULL;

-- Set default user_id to a static UUID for single-user mode
UPDATE public.bot_settings SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.exchanges SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.balances SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.trades SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.positions SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.notifications SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.daily_stats SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
UPDATE public.setup_progress SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;

-- Set default user_id for new inserts
ALTER TABLE public.bot_settings ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.exchanges ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.balances ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.trades ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.positions ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.notifications ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.daily_stats ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.setup_progress ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000000';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BotSettings } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export function useBotSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          ...data,
          min_order_size: Number(data.min_order_size),
          max_order_size: Number(data.max_order_size),
          spot_profit_target: Number(data.spot_profit_target),
          futures_profit_target: Number(data.futures_profit_target),
          daily_loss_limit: Number(data.daily_loss_limit),
        } as BotSettings);
      } else {
        await createDefaultSettings();
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch bot settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createDefaultSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('bot_settings')
        .insert({
          user_id: DEFAULT_USER_ID,
          is_paper_trading: true,
          is_bot_running: false,
          min_order_size: 333.00,
          max_order_size: 450.00,
          spot_profit_target: 1.00,
          futures_profit_target: 3.00,
          daily_loss_limit: 50.00,
          max_open_positions: 10,
          ai_aggressiveness: 'balanced',
        })
        .select()
        .single();

      if (error) throw error;

      setSettings({
        ...data,
        min_order_size: Number(data.min_order_size),
        max_order_size: Number(data.max_order_size),
        spot_profit_target: Number(data.spot_profit_target),
        futures_profit_target: Number(data.futures_profit_target),
        daily_loss_limit: Number(data.daily_loss_limit),
      } as BotSettings);
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const updateSettings = async (updates: Partial<BotSettings>) => {
    if (!settings) return;

    try {
      const { error } = await supabase
        .from('bot_settings')
        .update(updates)
        .eq('id', settings.id);

      if (error) throw error;

      setSettings({ ...settings, ...updates });
      toast({
        title: 'Success',
        description: 'Settings updated',
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update settings',
        variant: 'destructive',
      });
    }
  };

  const toggleBotRunning = async () => {
    if (!settings) return;
    await updateSettings({ is_bot_running: !settings.is_bot_running });
  };

  const togglePaperTrading = async () => {
    if (!settings) return;
    await updateSettings({ is_paper_trading: !settings.is_paper_trading });
  };

  return {
    settings,
    loading,
    updateSettings,
    toggleBotRunning,
    togglePaperTrading,
    refetch: fetchSettings,
  };
}

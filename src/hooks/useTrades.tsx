import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Trade, DailyStats } from '@/types/trading';

export function useTrades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTrades();
      fetchDailyStats();
      subscribeToTrades();
    }
  }, [user]);

  const fetchTrades = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      setTrades((data || []).map(t => ({
        ...t,
        entry_price: Number(t.entry_price),
        exit_price: t.exit_price ? Number(t.exit_price) : undefined,
        quantity: Number(t.quantity),
        order_size_usd: Number(t.order_size_usd),
        entry_fee: Number(t.entry_fee),
        exit_fee: Number(t.exit_fee),
        funding_fee: Number(t.funding_fee),
        gross_profit: t.gross_profit ? Number(t.gross_profit) : undefined,
        net_profit: t.net_profit ? Number(t.net_profit) : undefined,
        ai_score: t.ai_score ? Number(t.ai_score) : undefined,
      })) as Trade[]);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyStats = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      
      setDailyStats((data || []).map(s => ({
        ...s,
        gross_profit: Number(s.gross_profit),
        total_fees: Number(s.total_fees),
        net_profit: Number(s.net_profit),
        open_price: s.open_price ? Number(s.open_price) : undefined,
        high_price: s.high_price ? Number(s.high_price) : undefined,
        low_price: s.low_price ? Number(s.low_price) : undefined,
        close_price: s.close_price ? Number(s.close_price) : undefined,
      })) as DailyStats[]);
    } catch (error) {
      console.error('Error fetching daily stats:', error);
    }
  };

  const subscribeToTrades = () => {
    if (!user) return;

    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchTrades();
          fetchDailyStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getWinRate = (): number => {
    const closedTrades = trades.filter(t => t.status === 'closed');
    if (closedTrades.length === 0) return 0;
    const wins = closedTrades.filter(t => (t.net_profit || 0) > 0).length;
    return (wins / closedTrades.length) * 100;
  };

  const getTotalProfit = (): number => {
    return trades
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + (t.net_profit || 0), 0);
  };

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    return dailyStats.find(s => s.date === today) || null;
  };

  return {
    trades,
    dailyStats,
    loading,
    getWinRate,
    getTotalProfit,
    getTodayStats,
    refetch: fetchTrades,
  };
}

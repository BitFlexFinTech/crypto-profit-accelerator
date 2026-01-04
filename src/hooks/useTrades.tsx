import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trade, DailyStats } from '@/types/trading';

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades();
    fetchDailyStats();
    const cleanup = subscribeToTrades();
    return cleanup;
  }, []);

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
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
    try {
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
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
    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
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

  const getAverageProfit = (): number => {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.net_profit !== undefined);
    if (closedTrades.length === 0) return 0;
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
    return totalProfit / closedTrades.length;
  };

  const getAverageTimeToTarget = (): number => {
    const winningTrades = trades.filter(
      t => t.status === 'closed' && (t.net_profit || 0) > 0 && t.opened_at && t.closed_at
    );
    if (winningTrades.length === 0) return 0;
    
    const totalMs = winningTrades.reduce((sum, t) => {
      const openedAt = new Date(t.opened_at!).getTime();
      const closedAt = new Date(t.closed_at!).getTime();
      return sum + (closedAt - openedAt);
    }, 0);
    
    return totalMs / winningTrades.length;
  };

  const getBestTrade = (): Trade | null => {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.net_profit !== undefined);
    if (closedTrades.length === 0) return null;
    return closedTrades.reduce((best, t) => 
      (t.net_profit || 0) > (best.net_profit || 0) ? t : best
    );
  };

  const getWorstTrade = (): Trade | null => {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.net_profit !== undefined);
    if (closedTrades.length === 0) return null;
    return closedTrades.reduce((worst, t) => 
      (t.net_profit || 0) < (worst.net_profit || 0) ? t : worst
    );
  };

  const getProfitBySymbol = (): Record<string, { profit: number; count: number }> => {
    const bySymbol: Record<string, { profit: number; count: number }> = {};
    
    trades
      .filter(t => t.status === 'closed')
      .forEach(t => {
        if (!bySymbol[t.symbol]) {
          bySymbol[t.symbol] = { profit: 0, count: 0 };
        }
        bySymbol[t.symbol].profit += t.net_profit || 0;
        bySymbol[t.symbol].count += 1;
      });
    
    return bySymbol;
  };

  const getProfitByDirection = (): { long: number; short: number; longCount: number; shortCount: number } => {
    const result = { long: 0, short: 0, longCount: 0, shortCount: 0 };
    
    trades
      .filter(t => t.status === 'closed')
      .forEach(t => {
        if (t.direction === 'long') {
          result.long += t.net_profit || 0;
          result.longCount += 1;
        } else {
          result.short += t.net_profit || 0;
          result.shortCount += 1;
        }
      });
    
    return result;
  };

  const getClosedTradesCount = (): number => {
    return trades.filter(t => t.status === 'closed').length;
  };

  const getTotalFees = (): number => {
    return trades
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + (t.entry_fee || 0) + (t.exit_fee || 0) + (t.funding_fee || 0), 0);
  };

  const getCumulativePnLData = (): { date: string; cumulativeProfit: number; trade: string }[] => {
    const closedTrades = trades
      .filter(t => t.status === 'closed' && t.closed_at && t.net_profit !== undefined)
      .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
    
    let cumulative = 0;
    return closedTrades.map(t => {
      cumulative += t.net_profit || 0;
      return {
        date: new Date(t.closed_at!).toLocaleString(),
        cumulativeProfit: cumulative,
        trade: `${t.symbol} ${t.direction}`,
      };
    });
  };

  return {
    trades,
    dailyStats,
    loading,
    getWinRate,
    getTotalProfit,
    getTodayStats,
    getAverageProfit,
    getAverageTimeToTarget,
    getBestTrade,
    getWorstTrade,
    getProfitBySymbol,
    getProfitByDirection,
    getClosedTradesCount,
    getTotalFees,
    getCumulativePnLData,
    refetch: fetchTrades,
  };
}
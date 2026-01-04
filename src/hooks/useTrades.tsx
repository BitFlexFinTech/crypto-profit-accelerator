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

  // Get monthly stats for the past N months
  const getMonthlyStats = (months: number = 12): { month: string; trades: number; profit: number; winRate: number }[] => {
    const result: { month: string; trades: number; profit: number; winRate: number }[] = [];
    const now = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const monthTrades = trades.filter(t => {
        if (!t.closed_at || t.status !== 'closed') return false;
        const closeDate = new Date(t.closed_at);
        return closeDate >= monthStart && closeDate <= monthEnd;
      });

      const profit = monthTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
      const wins = monthTrades.filter(t => (t.net_profit || 0) > 0).length;
      const winRate = monthTrades.length > 0 ? (wins / monthTrades.length) * 100 : 0;

      result.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        trades: monthTrades.length,
        profit,
        winRate,
      });
    }
    
    return result;
  };

  // Get quarterly stats
  const getQuarterlyStats = (): { quarter: string; trades: number; profit: number }[] => {
    const result: { quarter: string; trades: number; profit: number }[] = [];
    const now = new Date();
    
    for (let i = 3; i >= 0; i--) {
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - (i * 3), 1);
      const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0, 23, 59, 59, 999);
      
      const quarterTrades = trades.filter(t => {
        if (!t.closed_at || t.status !== 'closed') return false;
        const closeDate = new Date(t.closed_at);
        return closeDate >= quarterStart && closeDate <= quarterEnd;
      });

      const profit = quarterTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
      const q = Math.floor(quarterStart.getMonth() / 3) + 1;

      result.push({
        quarter: `Q${q} ${quarterStart.getFullYear()}`,
        trades: quarterTrades.length,
        profit,
      });
    }
    
    return result;
  };

  // Get period comparison
  const getPeriodComparison = (period: 'week' | 'month' | 'quarter'): { current: number; previous: number; change: number } => {
    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

    switch (period) {
      case 'week':
        currentEnd = now;
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousEnd = currentStart;
        previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = now;
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'quarter':
        const currentQ = Math.floor(now.getMonth() / 3);
        currentStart = new Date(now.getFullYear(), currentQ * 3, 1);
        currentEnd = now;
        previousStart = new Date(now.getFullYear(), (currentQ - 1) * 3, 1);
        previousEnd = new Date(now.getFullYear(), currentQ * 3, 0, 23, 59, 59, 999);
        break;
    }

    const currentProfit = trades
      .filter(t => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= currentStart && new Date(t.closed_at) <= currentEnd)
      .reduce((sum, t) => sum + (t.net_profit || 0), 0);

    const previousProfit = trades
      .filter(t => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= previousStart && new Date(t.closed_at) <= previousEnd)
      .reduce((sum, t) => sum + (t.net_profit || 0), 0);

    const change = previousProfit !== 0 ? ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100 : 0;

    return { current: currentProfit, previous: previousProfit, change };
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
    getMonthlyStats,
    getQuarterlyStats,
    getPeriodComparison,
    refetch: fetchTrades,
  };
}
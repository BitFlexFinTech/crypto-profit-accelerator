import { useMemo } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { useTrades } from '@/hooks/useTrades';
import { subDays } from 'date-fns';

interface TPOrderEvent {
  id: string;
  symbol: string;
  direction: string;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  placedAt: string;
  filledAt?: string;
  fillDuration?: number; // in seconds
}

interface TakeProfitAnalytics {
  totalTPOrders: number;
  filledTPOrders: number;
  cancelledTPOrders: number;
  pendingTPOrders: number;
  fillRate: number;
  avgTimeToFill: number; // in seconds
  fastestFill: number; // in seconds
  slowestFill: number; // in seconds
  tpOrderHistory: TPOrderEvent[];
  dailyFillRate: { date: string; rate: number; count: number }[];
}

export function useTakeProfitAnalytics(days: number = 30): TakeProfitAnalytics {
  const { positions } = useTrading();
  const { trades } = useTrades();

  return useMemo(() => {
    const cutoff = subDays(new Date(), days);
    const events: TPOrderEvent[] = [];

    // Process current positions (pending orders)
    positions.forEach(p => {
      if (p.take_profit_order_id && p.opened_at) {
        const placedAt = new Date(p.opened_at);
        if (placedAt >= cutoff) {
          events.push({
            id: p.id,
            symbol: p.symbol,
            direction: p.direction,
            price: p.take_profit_price || 0,
            status: (p.take_profit_status as 'pending' | 'filled' | 'cancelled') || 'pending',
            placedAt: p.opened_at,
          });
        }
      }
    });

    // Process closed trades
    trades.forEach(t => {
      if (t.status === 'closed' && t.opened_at && t.closed_at) {
        const openedAt = new Date(t.opened_at);
        if (openedAt >= cutoff) {
          const closedAt = new Date(t.closed_at);
          const fillDuration = (closedAt.getTime() - openedAt.getTime()) / 1000;
          const isFilled = (t.net_profit || 0) > 0;
          
          events.push({
            id: t.id,
            symbol: t.symbol,
            direction: t.direction,
            price: t.exit_price || 0,
            status: isFilled ? 'filled' : 'cancelled',
            placedAt: t.opened_at,
            filledAt: t.closed_at,
            fillDuration,
          });
        }
      }
    });

    const filled = events.filter(e => e.status === 'filled');
    const cancelled = events.filter(e => e.status === 'cancelled');
    const pending = events.filter(e => e.status === 'pending');

    const fillDurations = filled
      .filter(e => e.fillDuration !== undefined)
      .map(e => e.fillDuration!);

    const avgTimeToFill = fillDurations.length > 0
      ? fillDurations.reduce((a, b) => a + b, 0) / fillDurations.length
      : 0;

    const fastestFill = fillDurations.length > 0
      ? Math.min(...fillDurations)
      : 0;

    const slowestFill = fillDurations.length > 0
      ? Math.max(...fillDurations)
      : 0;

    const completedOrders = filled.length + cancelled.length;
    const fillRate = completedOrders > 0 ? (filled.length / completedOrders) * 100 : 0;

    // Calculate daily fill rate
    const dailyMap = new Map<string, { filled: number; total: number }>();
    events.forEach(e => {
      if (e.status !== 'pending') {
        const date = e.filledAt ? e.filledAt.split('T')[0] : e.placedAt.split('T')[0];
        const existing = dailyMap.get(date) || { filled: 0, total: 0 };
        dailyMap.set(date, {
          filled: existing.filled + (e.status === 'filled' ? 1 : 0),
          total: existing.total + 1,
        });
      }
    });

    const dailyFillRate = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        rate: data.total > 0 ? (data.filled / data.total) * 100 : 0,
        count: data.total,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalTPOrders: events.length,
      filledTPOrders: filled.length,
      cancelledTPOrders: cancelled.length,
      pendingTPOrders: pending.length,
      fillRate,
      avgTimeToFill,
      fastestFill,
      slowestFill,
      tpOrderHistory: events.sort((a, b) => 
        new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
      ),
      dailyFillRate,
    };
  }, [positions, trades, days]);
}
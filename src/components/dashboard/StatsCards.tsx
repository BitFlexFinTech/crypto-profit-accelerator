import { useState, useEffect } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, TrendingDown, Target, Percent, Activity, Wallet, Lock } from 'lucide-react';

export function StatsCards() {
  const { balances, trades, positions, loading, engineMetrics } = useTrading();
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Update the "seconds ago" counter based on engineMetrics.lastScanTime
  useEffect(() => {
    const interval = setInterval(() => {
      if (engineMetrics.lastScanTime) {
        const elapsed = Math.floor((Date.now() - engineMetrics.lastScanTime.getTime()) / 1000);
        setSecondsAgo(elapsed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [engineMetrics.lastScanTime]);

  // Reset counter when lastScanTime updates
  useEffect(() => {
    if (engineMetrics.lastScanTime) {
      setSecondsAgo(0);
    }
  }, [engineMetrics.lastScanTime]);

  const totalBalance = balances.reduce((sum, b) => sum + (b.total || 0), 0);
  const availableBalance = balances.reduce((sum, b) => sum + (b.available || 0), 0);
  
  // FIX: Calculate locked balance from open positions' order_size_usd (not from balances.locked which is always $0 for paper trades)
  const lockedBalance = positions.reduce((sum, p) => sum + (p.order_size_usd || 0), 0);
  
  // Calculate stats from trades
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayTrades = trades.filter(t => new Date(t.created_at || '') >= todayStart);
  const todayProfit = todayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalProfit = trades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  
  const winningTrades = trades.filter(t => (t.net_profit || 0) > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  
  // Active positions unrealized P&L
  const unrealizedPnL = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        title="Total Balance"
        value={`$${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        icon={DollarSign}
        trend="neutral"
        showLive
        syncTime={secondsAgo}
      />
      
      <StatCard
        title="Available"
        value={`$${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        icon={Wallet}
        trend="up"
      />
      
      <StatCard
        title="Locked"
        value={`$${lockedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        subtitle={`${positions.length} position${positions.length !== 1 ? 's' : ''}`}
        icon={Lock}
        trend="neutral"
      />
      
      <StatCard
        title="Today's P&L"
        value={`${todayProfit >= 0 ? '+' : ''}$${todayProfit.toFixed(2)}`}
        subtitle={`${todayTrades.length} trades`}
        icon={todayProfit >= 0 ? TrendingUp : TrendingDown}
        trend={todayProfit >= 0 ? 'up' : 'down'}
        showLive
      />
      
      <StatCard
        title="Unrealized P&L"
        value={`${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`}
        icon={Activity}
        trend={unrealizedPnL >= 0 ? 'up' : 'down'}
        showLive
      />
      
      <StatCard
        title="Win Rate"
        value={`${winRate.toFixed(1)}%`}
        subtitle={`${winningTrades}/${trades.length} wins`}
        icon={winRate >= 50 ? Target : Percent}
        trend={winRate >= 50 ? 'up' : winRate >= 30 ? 'neutral' : 'down'}
      />
    </div>
  );
}

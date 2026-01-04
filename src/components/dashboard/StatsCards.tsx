import { useState, useEffect } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, Activity, Target, Percent, RefreshCw } from 'lucide-react';

export function StatsCards() {
  const { balances, trades, loading } = useTrading();
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Update the "seconds ago" counter every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Track when balances update
  useEffect(() => {
    if (balances.length > 0) {
      setLastUpdate(new Date());
      setSecondsAgo(0);
    }
  }, [balances]);

  const totalBalance = balances.reduce((sum, b) => sum + b.total, 0);
  
  // Calculate stats from trades
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayTrades = trades.filter(t => new Date(t.created_at || '') >= todayStart);
  const todayProfit = todayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalProfit = trades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  
  const winningTrades = trades.filter(t => (t.net_profit || 0) > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;

  const stats = [
    {
      title: 'Total Balance',
      value: `$${totalBalance.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      showSync: true,
    },
    {
      title: "Today's P&L",
      value: `${todayProfit >= 0 ? '+' : ''}$${todayProfit.toFixed(2)}`,
      icon: todayProfit >= 0 ? TrendingUp : TrendingDown,
      color: todayProfit >= 0 ? 'text-primary' : 'text-destructive',
      bgColor: todayProfit >= 0 ? 'bg-primary/10' : 'bg-destructive/10',
    },
    {
      title: 'Total Profit',
      value: `${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`,
      icon: Target,
      color: totalProfit >= 0 ? 'text-primary' : 'text-destructive',
      bgColor: totalProfit >= 0 ? 'bg-primary/10' : 'bg-destructive/10',
    },
    {
      title: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      icon: Percent,
      color: winRate >= 50 ? 'text-primary' : 'text-warning',
      bgColor: winRate >= 50 ? 'bg-primary/10' : 'bg-warning/10',
    },
    {
      title: "Today's Trades",
      value: todayTrades.length.toString(),
      icon: Activity,
      color: 'text-foreground',
      bgColor: 'bg-secondary',
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat, i) => (
        <Card key={i} className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  {stat.showSync && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <RefreshCw className={`h-3 w-3 ${secondsAgo < 2 ? 'animate-spin text-primary' : ''}`} />
                      <span>{secondsAgo}s</span>
                    </div>
                  )}
                </div>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { useExchanges } from '@/hooks/useExchanges';
import { useTrades } from '@/hooks/useTrades';
import { useBotSettings } from '@/hooks/useBotSettings';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, Activity, Target, Percent } from 'lucide-react';

export function StatsCards() {
  const { getTotalBalance, loading: balanceLoading } = useExchanges();
  const { getWinRate, getTotalProfit, getTodayStats, loading: tradesLoading } = useTrades();
  const { settings } = useBotSettings();

  const loading = balanceLoading || tradesLoading;
  const totalBalance = getTotalBalance();
  const winRate = getWinRate();
  const totalProfit = getTotalProfit();
  const todayStats = getTodayStats();

  const stats = [
    {
      title: 'Total Balance',
      value: `$${totalBalance.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: "Today's P&L",
      value: `${(todayStats?.net_profit || 0) >= 0 ? '+' : ''}$${(todayStats?.net_profit || 0).toFixed(2)}`,
      icon: todayStats?.net_profit && todayStats.net_profit >= 0 ? TrendingUp : TrendingDown,
      color: (todayStats?.net_profit || 0) >= 0 ? 'text-primary' : 'text-destructive',
      bgColor: (todayStats?.net_profit || 0) >= 0 ? 'bg-primary/10' : 'bg-destructive/10',
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
      value: todayStats?.total_trades.toString() || '0',
      icon: Activity,
      color: 'text-foreground',
      bgColor: 'bg-secondary',
    },
    {
      title: 'Trading Mode',
      value: settings?.is_paper_trading ? 'Paper' : 'Live',
      icon: Activity,
      color: settings?.is_paper_trading ? 'text-warning' : 'text-primary',
      bgColor: settings?.is_paper_trading ? 'bg-warning/10' : 'bg-primary/10',
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat, i) => (
        <Card key={i} className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

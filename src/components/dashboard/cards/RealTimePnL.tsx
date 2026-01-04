import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, Trophy, Target, Clock } from 'lucide-react';
import { useTrades } from '@/hooks/useTrades';
import { cn } from '@/lib/utils';
import { LiveBadge } from '@/components/ui/live-badge';

export function RealTimePnL() {
  const { trades, loading } = useTrades();
  const [animatedPnL, setAnimatedPnL] = useState(0);
  const [prevPnL, setPrevPnL] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayTrades = trades.filter(t => {
      const tradeDate = t.closed_at || t.opened_at;
      return tradeDate && tradeDate.startsWith(today) && t.status === 'closed';
    });

    const totalPnL = todayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
    const wins = todayTrades.filter(t => (t.net_profit || 0) > 0);
    const losses = todayTrades.filter(t => (t.net_profit || 0) <= 0);
    const winRate = todayTrades.length > 0 ? (wins.length / todayTrades.length) * 100 : 0;
    const avgProfit = todayTrades.length > 0 ? totalPnL / todayTrades.length : 0;
    
    const profits = todayTrades.map(t => t.net_profit || 0);
    const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;

    return {
      totalPnL,
      tradeCount: todayTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      avgProfit,
      bestTrade,
    };
  }, [trades]);

  useEffect(() => {
    if (todayStats.totalPnL !== prevPnL) {
      setIsAnimating(true);
      const diff = todayStats.totalPnL - animatedPnL;
      const steps = 20;
      const stepValue = diff / steps;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        setAnimatedPnL(prev => prev + stepValue);
        if (step >= steps) {
          clearInterval(interval);
          setAnimatedPnL(todayStats.totalPnL);
          setPrevPnL(todayStats.totalPnL);
          setTimeout(() => setIsAnimating(false), 200);
        }
      }, 25);

      return () => clearInterval(interval);
    }
  }, [todayStats.totalPnL, prevPnL, animatedPnL]);

  const isProfit = animatedPnL >= 0;

  if (loading) {
    return (
      <Card className="col-span-2 h-[200px]">
        <CardContent className="flex items-center justify-center h-full">
          <Activity className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Today's P&L
          </CardTitle>
          <LiveBadge />
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-3">
        {/* Main P&L Display */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className={cn(
              "text-2xl font-bold transition-all duration-300 tabular-nums",
              isProfit ? "text-primary" : "text-destructive",
              isAnimating && "scale-105"
            )}>
              {isProfit ? '+' : ''}{animatedPnL.toFixed(2)} USDT
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isProfit ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              {todayStats.tradeCount} trades today
            </div>
          </div>
          
          {/* Win Rate Circle */}
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="none" className="text-muted" />
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="none"
                strokeDasharray={`${todayStats.winRate * 1.5} 150`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold">{todayStats.winRate.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary font-semibold text-sm">
              <Trophy className="h-3 w-3" />
              {todayStats.wins}
            </div>
            <div className="text-[10px] text-muted-foreground">Wins</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-destructive font-semibold text-sm">
              <Target className="h-3 w-3" />
              {todayStats.losses}
            </div>
            <div className="text-[10px] text-muted-foreground">Losses</div>
          </div>
          <div className="text-center">
            <div className={cn("font-semibold text-sm tabular-nums", todayStats.avgProfit >= 0 ? "text-primary" : "text-destructive")}>
              ${todayStats.avgProfit.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">Avg Trade</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-sm text-primary tabular-nums">
              ${todayStats.bestTrade.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">Best</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

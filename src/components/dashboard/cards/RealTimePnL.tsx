import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Activity, Trophy, Target } from 'lucide-react';
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
      const steps = 15;
      const stepValue = diff / steps;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        setAnimatedPnL(prev => prev + stepValue);
        if (step >= steps) {
          clearInterval(interval);
          setAnimatedPnL(todayStats.totalPnL);
          setPrevPnL(todayStats.totalPnL);
          setTimeout(() => setIsAnimating(false), 150);
        }
      }, 20);

      return () => clearInterval(interval);
    }
  }, [todayStats.totalPnL, prevPnL, animatedPnL]);

  const isProfit = animatedPnL >= 0;

  if (loading) {
    return (
      <Card className="h-full overflow-hidden flex flex-col">
        <CardContent className="flex items-center justify-center h-full">
          <Activity className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="py-1.5 px-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-primary" />
            Today's P&L
          </CardTitle>
          <LiveBadge />
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-2 pt-0 flex flex-col justify-between min-h-0">
        {/* Main P&L Display */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className={cn(
              "text-xl font-bold transition-all duration-200 tabular-nums",
              isProfit ? "text-primary" : "text-destructive",
              isAnimating && "scale-105"
            )}>
              {isProfit ? '+' : ''}{animatedPnL.toFixed(2)} USDT
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {isProfit ? (
                <TrendingUp className="h-2.5 w-2.5 text-primary" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5 text-destructive" />
              )}
              {todayStats.tradeCount} trades today
            </div>
          </div>
          
          {/* Win Rate Circle */}
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="none" className="text-muted" />
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="none"
                strokeDasharray={`${todayStats.winRate * 1.25} 125`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-bold">{todayStats.winRate.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-border mt-auto">
          <div className="text-center">
            <div className="flex items-center justify-center gap-0.5 text-primary font-semibold text-xs">
              <Trophy className="h-2.5 w-2.5" />
              {todayStats.wins}
            </div>
            <div className="text-[9px] text-muted-foreground">Wins</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-0.5 text-destructive font-semibold text-xs">
              <Target className="h-2.5 w-2.5" />
              {todayStats.losses}
            </div>
            <div className="text-[9px] text-muted-foreground">Losses</div>
          </div>
          <div className="text-center">
            <div className={cn("font-semibold text-xs tabular-nums", todayStats.avgProfit >= 0 ? "text-primary" : "text-destructive")}>
              ${todayStats.avgProfit.toFixed(2)}
            </div>
            <div className="text-[9px] text-muted-foreground">Avg</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-xs text-primary tabular-nums">
              ${todayStats.bestTrade.toFixed(2)}
            </div>
            <div className="text-[9px] text-muted-foreground">Best</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
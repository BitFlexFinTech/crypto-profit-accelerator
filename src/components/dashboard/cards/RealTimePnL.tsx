import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, Trophy, Target, Clock } from 'lucide-react';
import { useTrades } from '@/hooks/useTrades';
import { cn } from '@/lib/utils';

export function RealTimePnL() {
  const { trades, loading } = useTrades();
  const [animatedPnL, setAnimatedPnL] = useState(0);
  const [prevPnL, setPrevPnL] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Calculate today's stats from trades
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
    const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;

    // Calculate hourly breakdown
    const hourlyPnL: { [hour: number]: number } = {};
    todayTrades.forEach(t => {
      const hour = new Date(t.closed_at || t.opened_at || '').getHours();
      hourlyPnL[hour] = (hourlyPnL[hour] || 0) + (t.net_profit || 0);
    });

    return {
      totalPnL,
      tradeCount: todayTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      avgProfit,
      bestTrade,
      worstTrade,
      hourlyPnL,
    };
  }, [trades]);

  // Animate P&L changes
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
  const maxHourlyPnL = Math.max(...Object.values(todayStats.hourlyPnL), 1);
  const minHourlyPnL = Math.min(...Object.values(todayStats.hourlyPnL), 0);
  const hourlyRange = Math.max(Math.abs(maxHourlyPnL), Math.abs(minHourlyPnL), 1);

  if (loading) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardContent className="flex items-center justify-center h-48">
          <Activity className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full lg:col-span-2 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Today's P&L
          </CardTitle>
          <Badge variant="outline" className="bg-primary/10 text-primary animate-pulse">
            <span className="w-2 h-2 bg-primary rounded-full mr-1.5" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main P&L Display */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className={cn(
              "text-4xl font-bold transition-all duration-300",
              isProfit ? "text-green-500" : "text-red-500",
              isAnimating && "scale-105"
            )}>
              {isProfit ? '+' : ''}{animatedPnL.toFixed(2)} USDT
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isProfit ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              {todayStats.tradeCount} trades completed today
            </div>
          </div>
          
          {/* Win Rate Circle */}
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="35"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-muted"
              />
              <circle
                cx="40"
                cy="40"
                r="35"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                strokeDasharray={`${todayStats.winRate * 2.2} 220`}
                className="text-green-500 transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold">{todayStats.winRate.toFixed(0)}%</span>
              <span className="text-xs text-muted-foreground">Win</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-500 font-semibold">
              <Trophy className="h-3.5 w-3.5" />
              {todayStats.wins}
            </div>
            <div className="text-xs text-muted-foreground">Wins</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-500 font-semibold">
              <Target className="h-3.5 w-3.5" />
              {todayStats.losses}
            </div>
            <div className="text-xs text-muted-foreground">Losses</div>
          </div>
          <div className="text-center">
            <div className={cn(
              "font-semibold",
              todayStats.avgProfit >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${todayStats.avgProfit.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Avg Trade</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-green-500">
              ${todayStats.bestTrade.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Best Trade</div>
          </div>
        </div>

        {/* Hourly Performance Bar */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Hourly Performance
          </div>
          <div className="flex items-end gap-0.5 h-12">
            {Array.from({ length: 24 }, (_, hour) => {
              const pnl = todayStats.hourlyPnL[hour] || 0;
              const heightPercent = Math.abs(pnl) / hourlyRange * 50;
              const isPositive = pnl >= 0;
              
              return (
                <div
                  key={hour}
                  className="flex-1 flex flex-col justify-center relative group"
                  style={{ height: '100%' }}
                >
                  <div
                    className={cn(
                      "w-full rounded-sm transition-all duration-300",
                      pnl !== 0 && (isPositive ? "bg-green-500/80" : "bg-red-500/80"),
                      pnl === 0 && "bg-muted h-0.5"
                    )}
                    style={{
                      height: pnl !== 0 ? `${Math.max(heightPercent, 8)}%` : '2px',
                      marginTop: isPositive ? 'auto' : undefined,
                      marginBottom: !isPositive ? 'auto' : undefined,
                    }}
                  />
                  {pnl !== 0 && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                      {hour}:00 - ${pnl.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>00:00</span>
            <span>12:00</span>
            <span>24:00</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

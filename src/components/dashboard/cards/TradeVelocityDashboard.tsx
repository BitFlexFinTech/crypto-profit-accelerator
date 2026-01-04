import { useMemo, useState, useEffect } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock, Target, Activity } from 'lucide-react';
import { differenceInSeconds, subHours, subMinutes } from 'date-fns';

export function TradeVelocityDashboard() {
  const { trades, positions, engineMetrics } = useTrading();
  
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const velocityMetrics = useMemo(() => {
    void tick;
    
    const now = new Date();
    const oneHourAgo = subHours(now, 1);
    const fiveMinAgo = subMinutes(now, 5);

    const tradesLastHour = trades.filter(t => 
      t.created_at && new Date(t.created_at) >= oneHourAgo
    );

    const tradesLast5Min = trades.filter(t => 
      t.created_at && new Date(t.created_at) >= fiveMinAgo
    );

    const closedLastHour = tradesLastHour.filter(t => t.status === 'closed' && t.net_profit !== null);
    const profitPerHour = closedLastHour.reduce((sum, t) => sum + (t.net_profit || 0), 0);
    const tradesPerMinute = tradesLast5Min.length / 5;

    const closedTrades = trades.filter(t => 
      t.status === 'closed' && 
      t.opened_at && 
      t.closed_at &&
      t.net_profit !== null &&
      t.net_profit > 0
    );

    let avgTimeToProfit = 0;
    let fastTradePercent = 0;
    
    if (closedTrades.length > 0) {
      const durations = closedTrades.map(t => {
        const opened = new Date(t.opened_at!);
        const closed = new Date(t.closed_at!);
        return differenceInSeconds(closed, opened);
      });
      
      avgTimeToProfit = durations.reduce((a, b) => a + b, 0) / durations.length;
      const fastTrades = durations.filter(d => d < 180).length;
      fastTradePercent = (fastTrades / closedTrades.length) * 100;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tradesToday = trades.filter(t => 
      t.created_at && new Date(t.created_at) >= todayStart
    );
    const closedToday = tradesToday.filter(t => t.status === 'closed').length;

    return {
      tradesPerMinute,
      profitPerHour,
      avgTimeToProfit,
      fastTradePercent,
      openedToday: tradesToday.length,
      closedToday,
      activePositions: positions.length,
      tradesLastHour: tradesLastHour.length,
    };
  }, [trades, positions, tick]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getSpeedRating = (avgTime: number): { label: string; color: string } => {
    if (avgTime === 0) return { label: 'N/A', color: 'text-muted-foreground' };
    if (avgTime < 60) return { label: 'ULTRA', color: 'text-primary' };
    if (avgTime < 180) return { label: 'FAST', color: 'text-primary' };
    if (avgTime < 300) return { label: 'NORMAL', color: 'text-yellow-500' };
    return { label: 'SLOW', color: 'text-destructive' };
  };

  const speedRating = getSpeedRating(velocityMetrics.avgTimeToProfit);

  return (
    <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
      <CardHeader className="py-1.5 px-2 flex-shrink-0">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-primary" />
          Trade Velocity
          <Badge 
            variant="outline" 
            className={`ml-auto text-[10px] px-1 py-0 ${speedRating.color}`}
          >
            {speedRating.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-2 pt-0 flex flex-col gap-2 min-h-0">
        {/* Primary Metrics */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-secondary/50 rounded p-2 text-center">
            <div className="text-lg font-bold text-primary">
              {velocityMetrics.tradesPerMinute.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground">Trades/Min</div>
          </div>
          <div className="bg-secondary/50 rounded p-2 text-center">
            <div className={`text-lg font-bold ${velocityMetrics.profitPerHour >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {velocityMetrics.profitPerHour >= 0 ? '+' : ''}${velocityMetrics.profitPerHour.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">Profit/Hour</div>
          </div>
        </div>

        {/* Speed Metrics */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center justify-between p-1.5 bg-secondary/30 rounded">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              Avg Time
            </div>
            <span className={`text-xs font-medium ${speedRating.color}`}>
              {formatDuration(velocityMetrics.avgTimeToProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between p-1.5 bg-secondary/30 rounded">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Target className="h-2.5 w-2.5" />
              Fast &lt;3m
            </div>
            <span className={`text-xs font-medium ${velocityMetrics.fastTradePercent >= 50 ? 'text-primary' : 'text-muted-foreground'}`}>
              {velocityMetrics.fastTradePercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Daily Stats */}
        <div className="flex items-center justify-between text-[10px] mt-auto">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              Today: <span className="text-foreground font-medium">{velocityMetrics.openedToday}/{velocityMetrics.closedToday}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Activity className="h-2.5 w-2.5" />
            {velocityMetrics.activePositions} active
          </div>
        </div>

        {/* Last Hour */}
        <div className="text-[9px] text-center text-muted-foreground border-t border-border pt-1">
          {velocityMetrics.tradesLastHour} trades/hr • {engineMetrics.tradesPerHour.toFixed(0)} projected
        </div>
      </CardContent>
    </Card>
  );
}
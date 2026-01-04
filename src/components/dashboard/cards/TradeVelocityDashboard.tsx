import { useMemo, useState, useEffect } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, TrendingUp, Clock, Target, Activity } from 'lucide-react';
import { differenceInSeconds, subHours, subMinutes } from 'date-fns';

export function TradeVelocityDashboard() {
  const { trades, positions, engineMetrics } = useTrading();
  
  // Force re-render every second for real-time updates
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const velocityMetrics = useMemo(() => {
    // Force dependency on tick for real-time calculation
    void tick;
    
    const now = new Date();
    const oneHourAgo = subHours(now, 1);
    const fiveMinAgo = subMinutes(now, 5);

    // Trades in last hour
    const tradesLastHour = trades.filter(t => 
      t.created_at && new Date(t.created_at) >= oneHourAgo
    );

    // Trades in last 5 minutes (for trades per minute calculation)
    const tradesLast5Min = trades.filter(t => 
      t.created_at && new Date(t.created_at) >= fiveMinAgo
    );

    // Closed trades for profit calculation
    const closedLastHour = tradesLastHour.filter(t => t.status === 'closed' && t.net_profit !== null);
    
    // Profit per hour
    const profitPerHour = closedLastHour.reduce((sum, t) => sum + (t.net_profit || 0), 0);

    // Trades per minute (based on last 5 min)
    const tradesPerMinute = tradesLast5Min.length / 5;

    // Calculate average time to profit for closed trades
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
      
      // Fast trades = closed in under 3 minutes
      const fastTrades = durations.filter(d => d < 180).length;
      fastTradePercent = (fastTrades / closedTrades.length) * 100;
    }

    // Trades opened today
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
    if (avgTime < 60) return { label: 'ULTRA FAST', color: 'text-primary' };
    if (avgTime < 180) return { label: 'FAST', color: 'text-primary' };
    if (avgTime < 300) return { label: 'NORMAL', color: 'text-yellow-500' };
    return { label: 'SLOW', color: 'text-destructive' };
  };

  const speedRating = getSpeedRating(velocityMetrics.avgTimeToProfit);

  return (
    <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Trade Velocity
          <Badge 
            variant="outline" 
            className={`ml-auto ${speedRating.color}`}
          >
            {speedRating.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-3">
        {/* Primary Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded p-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {velocityMetrics.tradesPerMinute.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">Trades/Min</div>
          </div>
          <div className="bg-secondary/50 rounded p-3 text-center">
            <div className={`text-2xl font-bold ${velocityMetrics.profitPerHour >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {velocityMetrics.profitPerHour >= 0 ? '+' : ''}${velocityMetrics.profitPerHour.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Profit/Hour</div>
          </div>
        </div>

        {/* Speed Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Avg Time to Profit
            </div>
            <span className={`text-sm font-medium ${speedRating.color}`}>
              {formatDuration(velocityMetrics.avgTimeToProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between p-2 bg-secondary/30 rounded">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              Fast Trades (&lt;3m)
            </div>
            <span className={`text-sm font-medium ${velocityMetrics.fastTradePercent >= 50 ? 'text-primary' : 'text-muted-foreground'}`}>
              {velocityMetrics.fastTradePercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Daily Stats */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              Today: <span className="text-foreground font-medium">{velocityMetrics.openedToday} opened</span>
            </span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-medium">{velocityMetrics.closedToday} closed</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Activity className="h-3 w-3" />
            {velocityMetrics.activePositions} active
          </div>
        </div>

        {/* Last Hour Stats */}
        <div className="text-xs text-center text-muted-foreground border-t border-border pt-2">
          {velocityMetrics.tradesLastHour} trades in last hour • 
          {engineMetrics.tradesPerHour.toFixed(0)} trades/hour projected
        </div>
      </CardContent>
    </Card>
  );
}
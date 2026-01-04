import { useTrades } from '@/hooks/useTrades';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Clock, Target, Award, Percent, DollarSign, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export function TradePerformancePanel() {
  const { 
    trades,
    loading, 
    getWinRate, 
    getTotalProfit, 
    getAverageProfit,
    getAverageTimeToTarget,
    getBestTrade,
    getWorstTrade,
    getProfitByDirection,
    getClosedTradesCount,
    getTotalFees,
    getCumulativePnLData,
  } = useTrades();

  if (loading) {
    return (
      <Card className="bg-card border-border col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const winRate = getWinRate();
  const totalProfit = getTotalProfit();
  const avgProfit = getAverageProfit();
  const avgTimeToTarget = getAverageTimeToTarget();
  const bestTrade = getBestTrade();
  const worstTrade = getWorstTrade();
  const byDirection = getProfitByDirection();
  const closedCount = getClosedTradesCount();
  const totalFees = getTotalFees();
  const cumulativePnLData = getCumulativePnLData();

  // Format average time to target
  const formatTime = (ms: number): string => {
    if (ms === 0) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <Card className="bg-card border-border col-span-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-foreground">Trade Performance</CardTitle>
        </div>
        <Badge variant="outline" className="text-xs">
          {closedCount} closed trades
        </Badge>
      </CardHeader>
      <CardContent>
        {closedCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No completed trades yet</p>
            <p className="text-sm mt-1">Statistics will appear here after trades are closed</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cumulative P&L Chart */}
            {cumulativePnLData.length > 1 && (
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
                  <TrendingUp className="h-4 w-4" />
                  Cumulative P&L
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulativePnLData}>
                      <defs>
                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(v) => `$${v}`}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-md p-2 text-xs shadow-lg">
                              <p className="text-muted-foreground">{data.trade}</p>
                              <p className={`font-mono font-medium ${data.cumulativeProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {data.cumulativeProfit >= 0 ? '+' : ''}${data.cumulativeProfit.toFixed(2)}
                              </p>
                              <p className="text-muted-foreground text-[10px]">{data.date}</p>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Area
                        type="monotone"
                        dataKey="cumulativeProfit"
                        stroke={totalProfit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                        strokeWidth={2}
                        fill={totalProfit >= 0 ? 'url(#profitGradient)' : 'url(#lossGradient)'}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Primary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Percent className="h-4 w-4" />
                  Win Rate
                </div>
                <p className={`text-2xl font-bold ${winRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                  {winRate.toFixed(1)}%
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="h-4 w-4" />
                  Total Profit
                </div>
                <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Target className="h-4 w-4" />
                  Avg Profit/Trade
                </div>
                <p className={`text-2xl font-bold font-mono ${avgProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Clock className="h-4 w-4" />
                  Avg Time to Target
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatTime(avgTimeToTarget)}
                </p>
              </div>
            </div>

            {/* Direction Performance */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">Long Trades</span>
                  </div>
                  <Badge variant="outline">{byDirection.longCount}</Badge>
                </div>
                <p className={`text-xl font-bold font-mono ${byDirection.long >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {byDirection.long >= 0 ? '+' : ''}${byDirection.long.toFixed(2)}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-foreground">Short Trades</span>
                  </div>
                  <Badge variant="outline">{byDirection.shortCount}</Badge>
                </div>
                <p className={`text-xl font-bold font-mono ${byDirection.short >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {byDirection.short >= 0 ? '+' : ''}${byDirection.short.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Best/Worst + Fees */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bestTrade && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-2 text-primary text-sm mb-2">
                    <Award className="h-4 w-4" />
                    Best Trade
                  </div>
                  <p className="font-medium text-foreground">{bestTrade.symbol}</p>
                  <p className="text-xl font-bold font-mono text-primary">
                    +${(bestTrade.net_profit || 0).toFixed(2)}
                  </p>
                  {bestTrade.closed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(bestTrade.closed_at))} ago
                    </p>
                  )}
                </div>
              )}

              {worstTrade && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <div className="flex items-center gap-2 text-destructive text-sm mb-2">
                    <TrendingDown className="h-4 w-4" />
                    Worst Trade
                  </div>
                  <p className="font-medium text-foreground">{worstTrade.symbol}</p>
                  <p className="text-xl font-bold font-mono text-destructive">
                    ${(worstTrade.net_profit || 0).toFixed(2)}
                  </p>
                  {worstTrade.closed_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(worstTrade.closed_at))} ago
                    </p>
                  )}
                </div>
              )}

              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <DollarSign className="h-4 w-4" />
                  Total Fees Paid
                </div>
                <p className="text-xl font-bold font-mono text-muted-foreground">
                  ${totalFees.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {closedCount > 0 ? `$${(totalFees / closedCount).toFixed(2)}/trade avg` : '-'}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
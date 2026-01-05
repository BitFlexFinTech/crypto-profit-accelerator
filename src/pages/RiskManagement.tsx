import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useTrades } from "@/hooks/useTrades";
import { useTrading } from "@/contexts/TradingContext";
import { Shield, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Target, Clock, BarChart3, PieChart } from "lucide-react";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

interface ExposureItem {
  symbol: string;
  exposure: number;
  positions: number;
}

const RiskManagement = () => {
  const { trades, dailyStats, getProfitBySymbol, getProfitByDirection } = useTrades();
  const { positions, settings, balances } = useTrading();

  // Calculate today's P&L from closed trades
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = trades.filter(t => 
    t.status === 'closed' && 
    t.closed_at && 
    t.closed_at.startsWith(today)
  );
  
  const todayRealizedPnL = todayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  
  // Total today's P&L (realized only - no estimated PnL)
  const totalTodayPnL = todayRealizedPnL;
  
  // Daily loss limit from settings
  const dailyLossLimit = settings?.daily_loss_limit || 40;
  
  // Calculate P&L progress (negative values towards limit)
  const pnlProgressPercent = totalTodayPnL < 0 
    ? Math.min(Math.abs(totalTodayPnL) / dailyLossLimit * 100, 100) 
    : 0;
  
  const isApproachingLimit = pnlProgressPercent >= 80;
  const isAtLimit = pnlProgressPercent >= 100;

  // Calculate exposure by pair (open positions)
  const exposureByPair = positions.reduce((acc, p) => {
    if (!acc[p.symbol]) {
      acc[p.symbol] = { symbol: p.symbol, exposure: 0, positions: 0 };
    }
    acc[p.symbol].exposure += p.order_size_usd;
    acc[p.symbol].positions += 1;
    return acc;
  }, {} as Record<string, ExposureItem>);
  
  const exposureData: ExposureItem[] = Object.values(exposureByPair).sort((a, b) => b.exposure - a.exposure);
  
  // Total balance for percentage calculations
  const totalBalance = balances.reduce((sum, b) => sum + (b.total || 0), 0);
  const maxExposurePerPair = totalBalance * 0.2; // 20% max per pair

  // Calculate direction breakdown
  const directionStats = getProfitByDirection();
  const longPositions = positions.filter(p => p.direction === 'long');
  const shortPositions = positions.filter(p => p.direction === 'short');
  
  // Position sizing recommendations based on volatility
  const positionSizingRecs = positions.map(p => {
    const currentSize = p.order_size_usd;
    const minSize = settings?.min_order_size || 333;
    const maxSize = settings?.max_order_size || 450;
    
    // Simple recommendation based on current unrealized P&L
    let recommendedSize = currentSize;
    let status: 'good' | 'warning' | 'danger' = 'good';
    
    if (p.unrealized_pnl && p.unrealized_pnl < -1) {
      recommendedSize = Math.max(minSize, currentSize * 0.8);
      status = 'warning';
    } else if (p.unrealized_pnl && p.unrealized_pnl > 0) {
      recommendedSize = Math.min(maxSize, currentSize * 1.1);
    }
    
    return {
      symbol: p.symbol,
      currentSize,
      recommendedSize,
      status,
      direction: p.direction,
    };
  });

  // Calculate risk metrics
  const closedTrades = trades.filter(t => t.status === 'closed' && t.net_profit !== undefined);
  const profits = closedTrades.map(t => t.net_profit || 0);
  
  // Max drawdown calculation
  let maxDrawdown = 0;
  let peak = 0;
  let cumulative = 0;
  closedTrades.forEach(t => {
    cumulative += t.net_profit || 0;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  // Win/Loss streaks
  let currentStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;
  
  closedTrades.forEach(t => {
    if ((t.net_profit || 0) > 0) {
      tempWinStreak++;
      tempLossStreak = 0;
      if (tempWinStreak > maxWinStreak) maxWinStreak = tempWinStreak;
    } else {
      tempLossStreak++;
      tempWinStreak = 0;
      if (tempLossStreak > maxLossStreak) maxLossStreak = tempLossStreak;
    }
  });
  
  // Current streak
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const profit = closedTrades[i].net_profit || 0;
    if (i === closedTrades.length - 1) {
      currentStreak = profit > 0 ? 1 : -1;
    } else {
      const prevProfit = closedTrades[i + 1].net_profit || 0;
      if ((profit > 0) === (prevProfit > 0)) {
        currentStreak += profit > 0 ? 1 : -1;
      } else {
        break;
      }
    }
  }

  // Sharpe ratio approximation (simplified)
  const avgReturn = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
  const stdDev = profits.length > 1 
    ? Math.sqrt(profits.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) / (profits.length - 1))
    : 1;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const directionChartData = [
    { name: 'Long', value: directionStats.longCount, profit: directionStats.long, fill: 'hsl(var(--success))' },
    { name: 'Short', value: directionStats.shortCount, profit: directionStats.short, fill: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Risk Management
          </h1>
          <p className="text-muted-foreground mt-1">Monitor daily P&L, exposure, and position sizing</p>
        </div>
        {isAtLimit && (
          <Badge variant="destructive" className="text-lg px-4 py-2 animate-pulse">
            <AlertTriangle className="h-5 w-5 mr-2" />
            DAILY LOSS LIMIT REACHED
          </Badge>
        )}
      </div>

      {/* Daily P&L Tracker */}
      <Card className={isAtLimit ? 'border-destructive' : isApproachingLimit ? 'border-warning' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Daily P&L Tracker
            </span>
            <Badge variant={totalTodayPnL >= 0 ? 'default' : 'destructive'}>
              {totalTodayPnL >= 0 ? '+' : ''}{totalTodayPnL.toFixed(2)} USD
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Today's Realized P&L</p>
              <p className={`text-2xl font-bold ${todayRealizedPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
                {todayRealizedPnL >= 0 ? '+' : ''}{todayRealizedPnL.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">{todayTrades.length} closed trades</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Open Positions</p>
              <p className="text-2xl font-bold text-foreground">{positions.length}</p>
              <p className="text-xs text-muted-foreground">Awaiting profit target</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Daily Loss Limit</p>
              <p className="text-2xl font-bold text-foreground">${dailyLossLimit.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Max allowed loss</p>
            </div>
          </div>
          
          {totalTodayPnL < 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress towards daily loss limit</span>
                <span className={isApproachingLimit ? 'text-warning font-bold' : 'text-muted-foreground'}>
                  {pnlProgressPercent.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={pnlProgressPercent} 
                className={`h-3 ${isAtLimit ? '[&>div]:bg-destructive' : isApproachingLimit ? '[&>div]:bg-warning' : ''}`}
              />
              {isApproachingLimit && !isAtLimit && (
                <p className="text-warning text-sm flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Warning: Approaching daily loss limit. Consider reducing position sizes.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Exposure by Pair */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Exposure by Pair
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exposureData.length > 0 ? (
              <div className="space-y-4">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={exposureData}
                        dataKey="exposure"
                        nameKey="symbol"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        label={({ symbol, exposure }) => `${symbol}: $${exposure.toFixed(0)}`}
                      >
                        {exposureData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Exposure']} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {exposureData.map((item, index) => {
                    const exposurePercent = totalBalance > 0 ? (item.exposure / totalBalance) * 100 : 0;
                    const isOverExposed = item.exposure > maxExposurePerPair;
                    
                    return (
                      <div key={item.symbol} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                          />
                          <span className="font-medium">{item.symbol}</span>
                          <Badge variant="outline" className="text-xs">{item.positions} pos</Badge>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono ${isOverExposed ? 'text-warning' : ''}`}>
                            ${item.exposure.toFixed(2)} ({exposurePercent.toFixed(1)}%)
                          </span>
                          {isOverExposed && (
                            <span className="ml-2 text-warning text-xs">⚠️ Over 20%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                No open positions
              </div>
            )}
          </CardContent>
        </Card>

        {/* Direction Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Direction Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="value" name="Trade Count" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="font-medium">Long Positions</span>
                  </div>
                  <p className="text-2xl font-bold">{longPositions.length}</p>
                  <p className="text-sm text-muted-foreground">
                    Total P&L: ${directionStats.long.toFixed(2)} ({directionStats.longCount} trades)
                  </p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <span className="font-medium">Short Positions</span>
                  </div>
                  <p className="text-2xl font-bold">{shortPositions.length}</p>
                  <p className="text-sm text-muted-foreground">
                    Total P&L: ${directionStats.short.toFixed(2)} ({directionStats.shortCount} trades)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Max Drawdown</p>
                <p className="text-xl font-bold text-destructive">-${maxDrawdown.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                <p className={`text-xl font-bold ${sharpeRatio >= 1 ? 'text-success' : sharpeRatio >= 0 ? 'text-warning' : 'text-destructive'}`}>
                  {sharpeRatio.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-success/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Best Win Streak</p>
                <p className="text-xl font-bold text-success">{maxWinStreak}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-warning/10 rounded-lg">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Streak</p>
                <p className={`text-xl font-bold ${currentStreak > 0 ? 'text-success' : currentStreak < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {currentStreak > 0 ? `+${currentStreak} wins` : currentStreak < 0 ? `${currentStreak} losses` : '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Position Sizing Recommendations */}
      {positionSizingRecs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Position Sizing Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {positionSizingRecs.map((rec, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={rec.direction === 'long' ? 'default' : 'secondary'}>
                      {rec.direction.toUpperCase()}
                    </Badge>
                    <span className="font-medium">{rec.symbol}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Current Size</p>
                      <p className="font-mono">${rec.currentSize.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Recommended</p>
                      <p className={`font-mono ${rec.status === 'warning' ? 'text-warning' : 'text-success'}`}>
                        ${rec.recommendedSize.toFixed(2)}
                      </p>
                    </div>
                    <Badge variant={rec.status === 'good' ? 'default' : 'secondary'}>
                      {rec.status === 'good' ? '✓ Optimal' : '⚠️ Adjust'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RiskManagement;

import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  BarChart3,
  Clock,
  Target,
  Wifi
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from 'recharts';
import { WebSocketStatusPanel } from '@/components/dashboard/cards/WebSocketStatusPanel';
import { TradePerformancePanel } from '@/components/dashboard/cards/TradePerformancePanel';
import { PairPerformanceLeaderboard } from '@/components/dashboard/cards/PairPerformanceLeaderboard';

export default function AnalyticsPage() {
  const { trades, positions, balances, signals, engineMetrics, isEngineRunning } = useTrading();

  // Calculate stats
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => (t.net_profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.net_profit || 0) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalProfit = trades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalFees = trades.reduce((sum, t) => sum + (t.entry_fee || 0) + (t.exit_fee || 0), 0);
  const avgTradeProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
  const totalBalance = balances.reduce((sum, b) => sum + b.total, 0);

  // Generate chart data
  const profitByDay = trades.reduce((acc, trade) => {
    const date = format(new Date(trade.created_at || Date.now()), 'MMM dd');
    if (!acc[date]) acc[date] = { date, profit: 0, trades: 0 };
    acc[date].profit += trade.net_profit || 0;
    acc[date].trades += 1;
    return acc;
  }, {} as Record<string, { date: string; profit: number; trades: number }>);

  const dailyData = Object.values(profitByDay).slice(-14);

  // Direction distribution
  const longTrades = trades.filter(t => t.direction === 'long').length;
  const shortTrades = trades.filter(t => t.direction === 'short').length;
  const directionData = [
    { name: 'Long', value: longTrades, color: 'hsl(var(--primary))' },
    { name: 'Short', value: shortTrades, color: 'hsl(var(--destructive))' },
  ];

  // Trade type distribution
  const spotTrades = trades.filter(t => t.trade_type === 'spot').length;
  const futuresTrades = trades.filter(t => t.trade_type === 'futures').length;
  const typeData = [
    { name: 'Spot', value: spotTrades, color: 'hsl(var(--primary))' },
    { name: 'Futures', value: futuresTrades, color: 'hsl(var(--warning))' },
  ];

  // Cumulative P&L
  let cumulative = 0;
  const cumulativeData = trades
    .slice()
    .reverse()
    .map(trade => {
      cumulative += trade.net_profit || 0;
      return {
        date: format(new Date(trade.created_at || Date.now()), 'HH:mm'),
        pnl: cumulative,
      };
    })
    .slice(-50);

  const stats = [
    { title: 'Total Balance', value: `$${totalBalance.toFixed(2)}`, icon: DollarSign, color: 'text-primary' },
    { title: 'Total Profit', value: `${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`, icon: totalProfit >= 0 ? TrendingUp : TrendingDown, color: totalProfit >= 0 ? 'text-primary' : 'text-destructive' },
    { title: 'Win Rate', value: `${winRate.toFixed(1)}%`, icon: Target, color: winRate >= 50 ? 'text-primary' : 'text-warning' },
    { title: 'Total Trades', value: totalTrades.toString(), icon: Activity, color: 'text-foreground' },
    { title: 'Avg Profit/Trade', value: `$${avgTradeProfit.toFixed(2)}`, icon: BarChart3, color: avgTradeProfit >= 0 ? 'text-primary' : 'text-destructive' },
    { title: 'Total Fees', value: `$${totalFees.toFixed(2)}`, icon: Clock, color: 'text-muted-foreground' },
  ];

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bot Analytics</h1>
        <p className="text-muted-foreground">Comprehensive trading performance analysis</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, i) => (
          <Card key={i} className="bg-card border-border animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-secondary")}>
                  <stat.icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className={cn("text-lg font-bold", stat.color)}>{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          {/* Trade Performance Panel - Moved from Dashboard */}
          <TradePerformancePanel />
          
          {/* Pair Performance Leaderboard - Moved from Dashboard */}
          <PairPerformanceLeaderboard />
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          {/* WebSocket Status Panel - Moved from Dashboard */}
          <div className="max-w-xl">
            <WebSocketStatusPanel />
          </div>

          {/* Engine Metrics */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wifi className="h-4 w-4 text-primary" />
                Engine Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Analysis Time</p>
                  <p className="text-xl font-bold">{engineMetrics.analysisTime}ms</p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Execution Time</p>
                  <p className="text-xl font-bold">{engineMetrics.executionTime}ms</p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Cycle Time</p>
                  <p className="text-xl font-bold">{engineMetrics.cycleTime}ms</p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Trades/Hour</p>
                  <p className="text-xl font-bold">{engineMetrics.tradesPerHour.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Direction Distribution */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Trade Direction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={directionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {directionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  {directionData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Trade Type Distribution */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Trade Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={typeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {typeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  {typeData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Win/Loss Breakdown */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Win/Loss Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-2xl font-bold text-primary">{winningTrades}</p>
                  <p className="text-sm text-muted-foreground">Winning</p>
                </div>
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="text-2xl font-bold text-destructive">{losingTrades}</p>
                  <p className="text-sm text-muted-foreground">Losing</p>
                </div>
                <div className="p-4 bg-secondary rounded-lg">
                  <p className="text-2xl font-bold">{totalTrades - winningTrades - losingTrades}</p>
                  <p className="text-sm text-muted-foreground">Breakeven</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {/* Cumulative P&L Chart */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Cumulative P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeData}>
                    <defs>
                      <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pnl"
                      stroke="hsl(var(--primary))"
                      fill="url(#pnlGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Daily P&L Chart */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar
                      dataKey="profit"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Active Signals */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Signals ({signals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {isEngineRunning ? 'Analyzing markets...' : 'Start bot to see signals'}
                </p>
              ) : (
                <div className="space-y-2">
                  {signals.slice(0, 5).map((signal, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{signal.symbol}</p>
                        <p className="text-xs text-muted-foreground">{signal.exchange}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-medium",
                          signal.direction === 'long' ? 'text-primary' : 'text-destructive'
                        )}>
                          {signal.direction.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Score: {signal.score}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

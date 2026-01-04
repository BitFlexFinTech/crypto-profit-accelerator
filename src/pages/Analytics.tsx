import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { TakeProfitStatusPanel } from '@/components/dashboard/cards/TakeProfitStatusPanel';
import { SignalDebugPanel } from '@/components/dashboard/cards/SignalDebugPanel';

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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold text-foreground">Bot Analytics</h1>
        <p className="text-muted-foreground text-sm">Comprehensive trading performance analysis</p>
      </div>

      {/* Stats Grid - Fixed */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg bg-secondary")}>
                    <stat.icon className={cn("h-3.5 w-3.5", stat.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                    <p className={cn("text-sm font-bold", stat.color)}>{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs - Fills remaining space */}
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <Tabs defaultValue="performance" className="h-full flex flex-col">
          <TabsList className="bg-secondary flex-shrink-0">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="signals">Signals & TP</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="performance" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 pr-4">
                  <TradePerformancePanel />
                  <PairPerformanceLeaderboard />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="signals" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 pr-4">
                  <TakeProfitStatusPanel />
                  <SignalDebugPanel />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="connections" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 pr-4">
                  <div className="max-w-xl">
                    <WebSocketStatusPanel />
                  </div>
                  
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
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="distribution" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 pr-4">
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

                  {/* Cumulative P&L Chart */}
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Cumulative P&L</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
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
                      <div className="h-[200px]">
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
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
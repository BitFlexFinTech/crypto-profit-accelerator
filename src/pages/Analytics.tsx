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

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => (t.net_profit || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.net_profit || 0) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalProfit = trades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalFees = trades.reduce((sum, t) => sum + (t.entry_fee || 0) + (t.exit_fee || 0), 0);
  const avgTradeProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
  const totalBalance = balances.reduce((sum, b) => sum + b.total, 0);

  const profitByDay = trades.reduce((acc, trade) => {
    const date = format(new Date(trade.created_at || Date.now()), 'MMM dd');
    if (!acc[date]) acc[date] = { date, profit: 0, trades: 0 };
    acc[date].profit += trade.net_profit || 0;
    acc[date].trades += 1;
    return acc;
  }, {} as Record<string, { date: string; profit: number; trades: number }>);

  const dailyData = Object.values(profitByDay).slice(-14);

  const longTrades = trades.filter(t => t.direction === 'long').length;
  const shortTrades = trades.filter(t => t.direction === 'short').length;
  const directionData = [
    { name: 'Long', value: longTrades, color: 'hsl(var(--primary))' },
    { name: 'Short', value: shortTrades, color: 'hsl(var(--destructive))' },
  ];

  const spotTrades = trades.filter(t => t.trade_type === 'spot').length;
  const futuresTrades = trades.filter(t => t.trade_type === 'futures').length;
  const typeData = [
    { name: 'Spot', value: spotTrades, color: 'hsl(var(--primary))' },
    { name: 'Futures', value: futuresTrades, color: 'hsl(var(--warning))' },
  ];

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
    { title: 'Balance', value: `$${totalBalance.toFixed(0)}`, icon: DollarSign, color: 'text-primary' },
    { title: 'Profit', value: `${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`, icon: totalProfit >= 0 ? TrendingUp : TrendingDown, color: totalProfit >= 0 ? 'text-primary' : 'text-destructive' },
    { title: 'Win Rate', value: `${winRate.toFixed(0)}%`, icon: Target, color: winRate >= 50 ? 'text-primary' : 'text-warning' },
    { title: 'Trades', value: totalTrades.toString(), icon: Activity, color: 'text-foreground' },
    { title: 'Avg/Trade', value: `$${avgTradeProfit.toFixed(2)}`, icon: BarChart3, color: avgTradeProfit >= 0 ? 'text-primary' : 'text-destructive' },
    { title: 'Fees', value: `$${totalFees.toFixed(2)}`, icon: Clock, color: 'text-muted-foreground' },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Fixed Header */}
      <div className="flex-shrink-0 h-12 border-b border-border px-3 flex items-center bg-card/50">
        <div>
          <h1 className="text-lg font-bold text-foreground">Bot Analytics</h1>
          <p className="text-xs text-muted-foreground">Performance analysis</p>
        </div>
      </div>

      {/* Stats Grid - Fixed */}
      <div className="flex-shrink-0 px-3 py-2">
        <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
          {stats.map((stat, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-2">
                <div className="flex items-center gap-1.5">
                  <div className={cn("p-1 rounded bg-secondary")}>
                    <stat.icon className={cn("h-3 w-3", stat.color)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{stat.title}</p>
                    <p className={cn("text-xs font-bold", stat.color)}>{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs - Fills remaining space */}
      <div className="flex-1 overflow-hidden px-3 pb-2 min-h-0">
        <Tabs defaultValue="performance" className="h-full flex flex-col">
          <TabsList className="bg-secondary flex-shrink-0 h-8">
            <TabsTrigger value="performance" className="text-xs h-7">Performance</TabsTrigger>
            <TabsTrigger value="signals" className="text-xs h-7">Signals</TabsTrigger>
            <TabsTrigger value="connections" className="text-xs h-7">Engine</TabsTrigger>
            <TabsTrigger value="distribution" className="text-xs h-7">Charts</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-2 min-h-0">
            <TabsContent value="performance" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  <TradePerformancePanel />
                  <PairPerformanceLeaderboard />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="signals" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  <TakeProfitStatusPanel />
                  <SignalDebugPanel />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="connections" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  <div className="max-w-xl">
                    <WebSocketStatusPanel />
                  </div>
                  
                  <Card className="bg-card border-border">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                        <Wifi className="h-3 w-3 text-primary" />
                        Engine Performance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="p-2 bg-secondary/50 rounded text-center">
                          <p className="text-[10px] text-muted-foreground">Analysis</p>
                          <p className="text-sm font-bold">{engineMetrics.analysisTime}ms</p>
                        </div>
                        <div className="p-2 bg-secondary/50 rounded text-center">
                          <p className="text-[10px] text-muted-foreground">Execution</p>
                          <p className="text-sm font-bold">{engineMetrics.executionTime}ms</p>
                        </div>
                        <div className="p-2 bg-secondary/50 rounded text-center">
                          <p className="text-[10px] text-muted-foreground">Cycle</p>
                          <p className="text-sm font-bold">{engineMetrics.cycleTime}ms</p>
                        </div>
                        <div className="p-2 bg-secondary/50 rounded text-center">
                          <p className="text-[10px] text-muted-foreground">Trades/Hr</p>
                          <p className="text-sm font-bold">{engineMetrics.tradesPerHour.toFixed(1)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="distribution" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {/* Direction Distribution */}
                    <Card className="bg-card border-border">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs font-medium">Direction</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <div className="h-32 flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                              <Pie data={directionData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={5} dataKey="value">
                                {directionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-2">
                          {directionData.map((item) => (
                            <div key={item.name} className="flex items-center gap-1.5 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}: {item.value}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Trade Type Distribution */}
                    <Card className="bg-card border-border">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs font-medium">Type</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <div className="h-32 flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                              <Pie data={typeData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={5} dataKey="value">
                                {typeData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </RechartsPie>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-2">
                          {typeData.map((item) => (
                            <div key={item.name} className="flex items-center gap-1.5 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}: {item.value}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Win/Loss Breakdown */}
                  <Card className="bg-card border-border">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-medium">Win/Loss</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-primary/10 rounded">
                          <p className="text-lg font-bold text-primary">{winningTrades}</p>
                          <p className="text-[10px] text-muted-foreground">Win</p>
                        </div>
                        <div className="p-2 bg-destructive/10 rounded">
                          <p className="text-lg font-bold text-destructive">{losingTrades}</p>
                          <p className="text-[10px] text-muted-foreground">Loss</p>
                        </div>
                        <div className="p-2 bg-secondary rounded">
                          <p className="text-lg font-bold">{totalTrades - winningTrades - losingTrades}</p>
                          <p className="text-[10px] text-muted-foreground">Even</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Cumulative P&L Chart */}
                  <Card className="bg-card border-border">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-xs font-medium">Cumulative P&L</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cumulativeData}>
                            <defs>
                              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }} />
                            <Area type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" fill="url(#pnlGradient)" strokeWidth={2} />
                          </AreaChart>
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
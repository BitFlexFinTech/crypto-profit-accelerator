import { useState, useMemo } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { useTrades } from '@/hooks/useTrades';
import { useExchanges } from '@/hooks/useExchanges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  BarChart3,
  Clock,
  Target,
  Wifi,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, getHours, getDay } from 'date-fns';
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
import { EXCHANGE_CONFIGS } from '@/types/trading';

export default function AnalyticsPage() {
  const { trades: contextTrades, positions, balances, signals, engineMetrics, isEngineRunning } = useTrading();
  const { trades, getWinRate, getTotalProfit } = useTrades();
  const { exchanges } = useExchanges();

  // Trade Stats filters
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'long' | 'short'>('all');
  const [sortBy, setSortBy] = useState<'profit' | 'duration' | 'winRate'>('profit');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const getExchangeName = (exchangeId?: string) => {
    if (!exchangeId) return 'Unknown';
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return 'Unknown';
    const config = EXCHANGE_CONFIGS.find(c => c.name === exchange.exchange);
    return config?.displayName || exchange.exchange;
  };

  // Get unique symbols for filter
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(trades.map(t => t.symbol));
    return Array.from(symbols).sort();
  }, [trades]);

  // Filter trades based on selections
  const filteredTrades = useMemo(() => {
    const now = new Date();
    let cutoffDate = new Date(0);
    
    if (dateRange === '7d') cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (dateRange === '30d') cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (dateRange === '90d') cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    return trades.filter(t => {
      if (t.status !== 'closed') return false;
      if (dateRange !== 'all' && t.closed_at && new Date(t.closed_at) < cutoffDate) return false;
      if (symbolFilter !== 'all' && t.symbol !== symbolFilter) return false;
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
      return true;
    });
  }, [trades, dateRange, symbolFilter, directionFilter]);

  // Performance by pair
  const performanceByPair = useMemo(() => {
    const byPair: Record<string, { 
      symbol: string; 
      trades: number; 
      wins: number; 
      totalProfit: number; 
      totalDuration: number;
      winningDurations: number[];
    }> = {};

    filteredTrades.forEach(t => {
      if (!byPair[t.symbol]) {
        byPair[t.symbol] = { symbol: t.symbol, trades: 0, wins: 0, totalProfit: 0, totalDuration: 0, winningDurations: [] };
      }
      byPair[t.symbol].trades++;
      byPair[t.symbol].totalProfit += t.net_profit || 0;
      
      if ((t.net_profit || 0) > 0) {
        byPair[t.symbol].wins++;
        if (t.opened_at && t.closed_at) {
          const duration = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000;
          byPair[t.symbol].winningDurations.push(duration);
          byPair[t.symbol].totalDuration += duration;
        }
      }
    });

    return Object.values(byPair).map(p => ({
      ...p,
      winRate: p.trades > 0 ? (p.wins / p.trades) * 100 : 0,
      avgProfit: p.trades > 0 ? p.totalProfit / p.trades : 0,
      avgDuration: p.winningDurations.length > 0 
        ? p.winningDurations.reduce((a, b) => a + b, 0) / p.winningDurations.length 
        : 0,
    })).sort((a, b) => {
      const multiplier = sortOrder === 'desc' ? -1 : 1;
      if (sortBy === 'profit') return multiplier * (a.totalProfit - b.totalProfit);
      if (sortBy === 'duration') return multiplier * (a.avgDuration - b.avgDuration);
      if (sortBy === 'winRate') return multiplier * (a.winRate - b.winRate);
      return 0;
    });
  }, [filteredTrades, sortBy, sortOrder]);

  // Performance by direction
  const performanceByDirection = useMemo(() => {
    const long = { trades: 0, wins: 0, profit: 0 };
    const short = { trades: 0, wins: 0, profit: 0 };

    filteredTrades.forEach(t => {
      const target = t.direction === 'long' ? long : short;
      target.trades++;
      target.profit += t.net_profit || 0;
      if ((t.net_profit || 0) > 0) target.wins++;
    });

    return [
      { name: 'Long', ...long, winRate: long.trades > 0 ? (long.wins / long.trades) * 100 : 0 },
      { name: 'Short', ...short, winRate: short.trades > 0 ? (short.wins / short.trades) * 100 : 0 },
    ];
  }, [filteredTrades]);

  // Duration histogram
  const durationHistogram = useMemo(() => {
    const buckets = [
      { range: '0-1m', min: 0, max: 60, count: 0 },
      { range: '1-5m', min: 60, max: 300, count: 0 },
      { range: '5-15m', min: 300, max: 900, count: 0 },
      { range: '15-30m', min: 900, max: 1800, count: 0 },
      { range: '30-60m', min: 1800, max: 3600, count: 0 },
      { range: '1h+', min: 3600, max: Infinity, count: 0 },
    ];

    filteredTrades.forEach(t => {
      if (t.opened_at && t.closed_at) {
        const duration = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000;
        const bucket = buckets.find(b => duration >= b.min && duration < b.max);
        if (bucket) bucket.count++;
      }
    });

    return buckets;
  }, [filteredTrades]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  // History tab data
  const closedTrades = trades.filter(t => t.status === 'closed');
  const historyWinRate = getWinRate();
  const historyTotalProfit = getTotalProfit();
  const historyWins = closedTrades.filter(t => (t.net_profit || 0) > 0).length;
  const historyLosses = closedTrades.filter(t => (t.net_profit || 0) <= 0).length;

  // Analytics stats
  const totalTrades = contextTrades.length;
  const winningTrades = contextTrades.filter(t => (t.net_profit || 0) > 0).length;
  const losingTrades = contextTrades.filter(t => (t.net_profit || 0) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalProfit = contextTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalFees = contextTrades.reduce((sum, t) => sum + (t.entry_fee || 0) + (t.exit_fee || 0), 0);
  const avgTradeProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
  const totalBalance = balances.reduce((sum, b) => sum + b.total, 0);

  const profitByDay = contextTrades.reduce((acc, trade) => {
    const date = format(new Date(trade.created_at || Date.now()), 'MMM dd');
    if (!acc[date]) acc[date] = { date, profit: 0, trades: 0 };
    acc[date].profit += trade.net_profit || 0;
    acc[date].trades += 1;
    return acc;
  }, {} as Record<string, { date: string; profit: number; trades: number }>);

  const dailyData = Object.values(profitByDay).slice(-14);

  const longTrades = contextTrades.filter(t => t.direction === 'long').length;
  const shortTrades = contextTrades.filter(t => t.direction === 'short').length;
  const directionData = [
    { name: 'Long', value: longTrades, color: 'hsl(var(--primary))' },
    { name: 'Short', value: shortTrades, color: 'hsl(var(--destructive))' },
  ];

  const spotTrades = contextTrades.filter(t => t.trade_type === 'spot').length;
  const futuresTrades = contextTrades.filter(t => t.trade_type === 'futures').length;
  const typeData = [
    { name: 'Spot', value: spotTrades, color: 'hsl(var(--primary))' },
    { name: 'Futures', value: futuresTrades, color: 'hsl(var(--warning))' },
  ];

  let cumulative = 0;
  const cumulativeData = contextTrades
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
            <TabsTrigger value="history" className="text-xs h-7">History</TabsTrigger>
            <TabsTrigger value="trade-stats" className="text-xs h-7">Trade Stats</TabsTrigger>
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

            {/* History Tab */}
            <TabsContent value="history" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  {/* Stats Cards */}
                  <div className="grid gap-3 md:grid-cols-4">
                    <Card className="bg-card border-border">
                      <CardContent className="pt-3 pb-2">
                        <p className="text-xs text-muted-foreground">Total Trades</p>
                        <p className="text-xl font-bold text-foreground">{closedTrades.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="pt-3 pb-2">
                        <p className="text-xs text-muted-foreground">Win Rate</p>
                        <p className={`text-xl font-bold ${historyWinRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                          {historyWinRate.toFixed(1)}%
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="pt-3 pb-2">
                        <p className="text-xs text-muted-foreground">Wins / Losses</p>
                        <p className="text-xl font-bold">
                          <span className="text-primary">{historyWins}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-destructive">{historyLosses}</span>
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="pt-3 pb-2">
                        <p className="text-xs text-muted-foreground">Total Profit</p>
                        <p className={`text-xl font-bold ${historyTotalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {historyTotalProfit >= 0 ? '+' : ''}${historyTotalProfit.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Trades Table */}
                  <Card className="bg-card border-border">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm text-foreground">Recent Trades</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {closedTrades.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No trade history yet</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border">
                                <TableHead className="text-xs text-muted-foreground">Date</TableHead>
                                <TableHead className="text-xs text-muted-foreground">Exchange</TableHead>
                                <TableHead className="text-xs text-muted-foreground">Pair</TableHead>
                                <TableHead className="text-xs text-muted-foreground">Type</TableHead>
                                <TableHead className="text-xs text-muted-foreground">Dir</TableHead>
                                <TableHead className="text-xs text-muted-foreground text-right">Size</TableHead>
                                <TableHead className="text-xs text-muted-foreground text-right">Entry</TableHead>
                                <TableHead className="text-xs text-muted-foreground text-right">Exit</TableHead>
                                <TableHead className="text-xs text-muted-foreground text-right">P&L</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {closedTrades.map((trade) => (
                                <TableRow key={trade.id} className="border-border">
                                  <TableCell className="text-xs text-foreground py-2">
                                    {trade.closed_at && format(new Date(trade.closed_at), 'MMM dd, HH:mm')}
                                  </TableCell>
                                  <TableCell className="text-xs text-foreground py-2">
                                    {getExchangeName(trade.exchange_id)}
                                  </TableCell>
                                  <TableCell className="text-xs font-medium text-foreground py-2">{trade.symbol}</TableCell>
                                  <TableCell className="py-2">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      {trade.trade_type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Badge 
                                      variant={trade.direction === 'long' ? 'default' : 'destructive'}
                                      className={`text-[10px] px-1 py-0 ${trade.direction === 'long' ? 'bg-primary text-primary-foreground' : ''}`}
                                    >
                                      {trade.direction === 'long' ? (
                                        <TrendingUp className="h-2.5 w-2.5" />
                                      ) : (
                                        <TrendingDown className="h-2.5 w-2.5" />
                                      )}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-foreground py-2">
                                    ${trade.order_size_usd.toFixed(0)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                                    ${trade.entry_price.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                                    ${trade.exit_price?.toFixed(2) || '-'}
                                  </TableCell>
                                  <TableCell className={`text-right font-mono text-xs font-medium py-2 ${(trade.net_profit || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                    {(trade.net_profit || 0) >= 0 ? '+' : ''}${(trade.net_profit || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Trade Stats Tab */}
            <TabsContent value="trade-stats" className="h-full m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 pr-3">
                  {/* Filters */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue placeholder="Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7d">7 days</SelectItem>
                        <SelectItem value="30d">30 days</SelectItem>
                        <SelectItem value="90d">90 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue placeholder="Symbol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All pairs</SelectItem>
                        {uniqueSymbols.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as any)}>
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue placeholder="Dir" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-2">
                    <Card className="bg-card border-border">
                      <CardContent className="p-2">
                        <p className="text-[10px] text-muted-foreground">Trades</p>
                        <p className="text-lg font-bold">{filteredTrades.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="p-2">
                        <p className="text-[10px] text-muted-foreground">Win Rate</p>
                        <p className="text-lg font-bold text-primary">
                          {filteredTrades.length > 0 
                            ? ((filteredTrades.filter(t => (t.net_profit || 0) > 0).length / filteredTrades.length) * 100).toFixed(1)
                            : 0}%
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="p-2">
                        <p className="text-[10px] text-muted-foreground">Profit</p>
                        <p className={`text-lg font-bold ${filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          ${filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0).toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-card border-border">
                      <CardContent className="p-2">
                        <p className="text-[10px] text-muted-foreground">Avg Time</p>
                        <p className="text-lg font-bold">
                          {formatDuration(
                            filteredTrades
                              .filter(t => t.opened_at && t.closed_at && (t.net_profit || 0) > 0)
                              .reduce((sum, t) => sum + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 1000, 0) /
                            (filteredTrades.filter(t => (t.net_profit || 0) > 0).length || 1)
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Performance by Pair Table */}
                  <Card className="bg-card border-border">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Performance by Pair
                        </span>
                        <div className="flex items-center gap-1">
                          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                            <SelectTrigger className="w-24 h-6 text-[10px]">
                              <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="profit">Profit</SelectItem>
                              <SelectItem value="duration">Duration</SelectItem>
                              <SelectItem value="winRate">Win Rate</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          >
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="text-[10px]">Symbol</TableHead>
                            <TableHead className="text-right text-[10px]">Trades</TableHead>
                            <TableHead className="text-right text-[10px]">Win%</TableHead>
                            <TableHead className="text-right text-[10px]">Avg</TableHead>
                            <TableHead className="text-right text-[10px]">Total</TableHead>
                            <TableHead className="text-right text-[10px]">Dur</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {performanceByPair.slice(0, 10).map(p => (
                            <TableRow key={p.symbol} className="border-border">
                              <TableCell className="font-medium text-xs py-1.5">{p.symbol}</TableCell>
                              <TableCell className="text-right text-xs py-1.5">{p.trades}</TableCell>
                              <TableCell className="text-right py-1.5">
                                <Badge variant={p.winRate >= 50 ? 'default' : 'secondary'} className="text-[10px] px-1 py-0">
                                  {p.winRate.toFixed(0)}%
                                </Badge>
                              </TableCell>
                              <TableCell className={`text-right text-xs py-1.5 ${p.avgProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                ${p.avgProfit.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right text-xs font-mono py-1.5 ${p.totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                ${p.totalProfit.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right py-1.5">
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {formatDuration(p.avgDuration)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Direction Performance */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <Card className="bg-card border-border">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Long vs Short
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <div className="space-y-2">
                          {performanceByDirection.map(d => (
                            <div key={d.name} className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                              <div className="flex items-center gap-2">
                                <Badge variant={d.name === 'Long' ? 'default' : 'destructive'} className="text-[10px]">
                                  {d.name}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{d.trades} trades</span>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs font-bold ${d.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                  ${d.profit.toFixed(2)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{d.winRate.toFixed(0)}% win</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Duration Histogram */}
                    <Card className="bg-card border-border">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Duration Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <div className="h-24">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={durationHistogram}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="range" fontSize={9} stroke="hsl(var(--muted-foreground))" />
                              <YAxis fontSize={9} stroke="hsl(var(--muted-foreground))" />
                              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '10px' }} />
                              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
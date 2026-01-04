import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTrades } from "@/hooks/useTrades";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  Zap, 
  Calendar,
  Filter,
  ArrowUpDown
} from "lucide-react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell, Area, AreaChart 
} from "recharts";
import { format, parseISO, startOfDay, startOfWeek, getHours, getDay } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const TradeAnalytics = () => {
  const { trades, getWinRate, getTotalProfit, getAverageTimeToTarget } = useTrades();
  
  // Filters
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'long' | 'short'>('all');
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'all' | 'spot' | 'futures'>('all');
  const [sortBy, setSortBy] = useState<'profit' | 'duration' | 'winRate'>('profit');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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
      if (tradeTypeFilter !== 'all' && t.trade_type !== tradeTypeFilter) return false;
      return true;
    });
  }, [trades, dateRange, symbolFilter, directionFilter, tradeTypeFilter]);

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
      speedScore: p.winningDurations.length > 0 
        ? (p.wins / p.trades) * (300 / (p.totalDuration / p.wins)) * 100
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

  // Performance by hour of day
  const performanceByHour = useMemo(() => {
    const byHour: Record<number, { hour: number; trades: number; profit: number }> = {};
    
    for (let i = 0; i < 24; i++) {
      byHour[i] = { hour: i, trades: 0, profit: 0 };
    }

    filteredTrades.forEach(t => {
      if (t.opened_at) {
        const hour = getHours(parseISO(t.opened_at));
        byHour[hour].trades++;
        byHour[hour].profit += t.net_profit || 0;
      }
    });

    return Object.values(byHour).map(h => ({
      ...h,
      label: `${h.hour.toString().padStart(2, '0')}:00`,
    }));
  }, [filteredTrades]);

  // Performance by day of week
  const performanceByDay = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDay: Record<number, { day: number; name: string; trades: number; profit: number }> = {};
    
    for (let i = 0; i < 7; i++) {
      byDay[i] = { day: i, name: days[i], trades: 0, profit: 0 };
    }

    filteredTrades.forEach(t => {
      if (t.opened_at) {
        const day = getDay(parseISO(t.opened_at));
        byDay[day].trades++;
        byDay[day].profit += t.net_profit || 0;
      }
    });

    return Object.values(byDay);
  }, [filteredTrades]);

  // Fastest trades
  const fastestTrades = useMemo(() => {
    return filteredTrades
      .filter(t => (t.net_profit || 0) > 0 && t.opened_at && t.closed_at)
      .map(t => ({
        ...t,
        duration: (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 1000,
      }))
      .sort((a, b) => a.duration - b.duration)
      .slice(0, 10);
  }, [filteredTrades]);

  // Slowest trades
  const slowestTrades = useMemo(() => {
    return filteredTrades
      .filter(t => t.opened_at && t.closed_at)
      .map(t => ({
        ...t,
        duration: (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 1000,
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
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

  const COLORS = ['hsl(var(--success))', 'hsl(var(--destructive))'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            Trade Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Detailed historical performance analysis</p>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={symbolFilter} onValueChange={setSymbolFilter}>
            <SelectTrigger className="w-32">
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
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={tradeTypeFilter} onValueChange={(v) => setTradeTypeFilter(v as any)}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
              <SelectItem value="futures">Futures</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold">{filteredTrades.length}</p>
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
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold text-success">
                  {filteredTrades.length > 0 
                    ? ((filteredTrades.filter(t => (t.net_profit || 0) > 0).length / filteredTrades.length) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0) >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0) >= 0 
                  ? <TrendingUp className="h-5 w-5 text-success" />
                  : <TrendingDown className="h-5 w-5 text-destructive" />
                }
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Profit</p>
                <p className={`text-2xl font-bold ${filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${filteredTrades.reduce((s, t) => s + (t.net_profit || 0), 0).toFixed(2)}
                </p>
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
                <p className="text-sm text-muted-foreground">Avg Close Time</p>
                <p className="text-2xl font-bold">
                  {formatDuration(
                    filteredTrades
                      .filter(t => t.opened_at && t.closed_at && (t.net_profit || 0) > 0)
                      .reduce((sum, t) => sum + (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 1000, 0) /
                    (filteredTrades.filter(t => (t.net_profit || 0) > 0).length || 1)
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance by Pair Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance by Pair
            </span>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sort by" />
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
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Avg Profit</TableHead>
                <TableHead className="text-right">Total Profit</TableHead>
                <TableHead className="text-right">Avg Duration</TableHead>
                <TableHead className="text-right">Speed Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performanceByPair.map(p => (
                <TableRow key={p.symbol}>
                  <TableCell className="font-medium">{p.symbol}</TableCell>
                  <TableCell className="text-right">{p.trades}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.winRate >= 50 ? 'default' : 'secondary'}>
                      {p.winRate.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right ${p.avgProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ${p.avgProfit.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${p.totalProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ${p.totalProfit.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={p.avgDuration < 300 ? 'default' : p.avgDuration < 900 ? 'secondary' : 'outline'}>
                      {formatDuration(p.avgDuration)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-mono ${p.speedScore >= 50 ? 'text-success' : p.speedScore >= 25 ? 'text-warning' : 'text-muted-foreground'}`}>
                      {p.speedScore.toFixed(0)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Direction Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Long vs Short Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceByDirection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                      if (name === 'trades') return [value, 'Trades'];
                      if (name === 'winRate') return [`${value.toFixed(1)}%`, 'Win Rate'];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="profit" name="Profit" fill="hsl(var(--primary))" />
                  <Bar dataKey="trades" name="Trades" fill="hsl(var(--muted-foreground))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Duration Histogram */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Trade Duration Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="range" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" name="Trades" fill="hsl(var(--chart-1))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Profit by Hour */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Profit by Hour of Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Profit by Day */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Profit by Day of Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    contentStyle={{ 
                      background: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="profit" name="Profit" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fastest & Slowest Trades */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <Zap className="h-5 w-5" />
              Top 10 Fastest Profitable Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fastestTrades.map((t, i) => (
                <div key={t.id} className="flex items-center justify-between p-2 bg-success/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-success">#{i + 1}</Badge>
                    <span className="font-medium">{t.symbol}</span>
                    <Badge variant={t.direction === 'long' ? 'default' : 'secondary'} className="text-xs">
                      {t.direction}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-success font-mono">+${(t.net_profit || 0).toFixed(2)}</span>
                    <Badge className="bg-success/20 text-success">{formatDuration(t.duration)}</Badge>
                  </div>
                </div>
              ))}
              {fastestTrades.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No profitable trades in selected range</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Clock className="h-5 w-5" />
              Top 10 Slowest Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slowestTrades.map((t, i) => (
                <div key={t.id} className="flex items-center justify-between p-2 bg-warning/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-warning">#{i + 1}</Badge>
                    <span className="font-medium">{t.symbol}</span>
                    <Badge variant={t.direction === 'long' ? 'default' : 'secondary'} className="text-xs">
                      {t.direction}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-mono ${(t.net_profit || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {(t.net_profit || 0) >= 0 ? '+' : ''}{(t.net_profit || 0).toFixed(2)}
                    </span>
                    <Badge variant="outline" className="text-warning">{formatDuration(t.duration)}</Badge>
                  </div>
                </div>
              ))}
              {slowestTrades.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No trades in selected range</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TradeAnalytics;

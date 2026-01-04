import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyPerformanceChart } from "@/components/dashboard/cards/MonthlyPerformanceChart";
import { PeriodComparisonCard } from "@/components/dashboard/cards/PeriodComparisonCard";
import { PnLHeatmap } from "@/components/dashboard/cards/PnLHeatmap";
import { TakeProfitHistoryChart } from "@/components/dashboard/cards/TakeProfitHistoryChart";
import { TakeProfitStatusPanel } from "@/components/dashboard/cards/TakeProfitStatusPanel";
import { useTrades } from "@/hooks/useTrades";
import { useTakeProfitAnalytics } from "@/hooks/useTakeProfitAnalytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, subDays, subWeeks } from "date-fns";
import { TrendingUp, Calendar, Target, Activity } from "lucide-react";

export default function PerformanceAnalyticsPage() {
  const { trades, dailyStats, getWinRate, getTotalProfit, getClosedTradesCount } = useTrades();
  const tpAnalytics = useTakeProfitAnalytics(30);
  const [activeTab, setActiveTab] = useState("daily");

  // Generate daily data for the past 30 days
  const dailyData = eachDayOfInterval({
    start: subDays(new Date(), 29),
    end: new Date(),
  }).map(day => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    
    const dayTrades = trades.filter(t => {
      if (!t.closed_at || t.status !== 'closed') return false;
      const closeDate = new Date(t.closed_at);
      return closeDate >= dayStart && closeDate <= dayEnd;
    });

    const profit = dayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
    const wins = dayTrades.filter(t => (t.net_profit || 0) > 0).length;
    const winRate = dayTrades.length > 0 ? (wins / dayTrades.length) * 100 : 0;

    return {
      date: format(day, 'MMM dd'),
      fullDate: format(day, 'MMMM dd, yyyy'),
      profit: Number(profit.toFixed(2)),
      trades: dayTrades.length,
      winRate: Number(winRate.toFixed(1)),
    };
  });

  // Generate weekly data for the past 12 weeks
  const weeklyData = eachWeekOfInterval({
    start: subWeeks(new Date(), 11),
    end: new Date(),
  }, { weekStartsOn: 1 }).map(weekStart => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    
    const weekTrades = trades.filter(t => {
      if (!t.closed_at || t.status !== 'closed') return false;
      const closeDate = new Date(t.closed_at);
      return closeDate >= weekStart && closeDate <= weekEnd;
    });

    const profit = weekTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
    const wins = weekTrades.filter(t => (t.net_profit || 0) > 0).length;
    const winRate = weekTrades.length > 0 ? (wins / weekTrades.length) * 100 : 0;

    return {
      week: format(weekStart, 'MMM dd'),
      fullWeek: `Week of ${format(weekStart, 'MMMM dd, yyyy')}`,
      profit: Number(profit.toFixed(2)),
      trades: weekTrades.length,
      winRate: Number(winRate.toFixed(1)),
    };
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-foreground">Performance Analytics</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total P&L:</span>
            <span className={`font-mono ${getTotalProfit() >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${getTotalProfit().toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Win Rate:</span>
            <span className="font-mono text-foreground">{getWinRate().toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Trades:</span>
            <span className="font-mono text-foreground">{getClosedTradesCount()}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="daily" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Weekly
            </TabsTrigger>
            <TabsTrigger value="monthly" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Monthly
            </TabsTrigger>
            <TabsTrigger value="takeprofit" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Take-Profit
            </TabsTrigger>
          </TabsList>

          {/* Daily View */}
          <TabsContent value="daily" className="space-y-4">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Daily P&L (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                        interval={4}
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate}
                        formatter={(value: number, name: string) => {
                          if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                        {dailyData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.profit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <PnLHeatmap />
              <PeriodComparisonCard />
            </div>
          </TabsContent>

          {/* Weekly View */}
          <TabsContent value="weekly" className="space-y-4">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Weekly P&L (Last 12 Weeks)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="week" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullWeek}
                        formatter={(value: number, name: string) => {
                          if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                        {weeklyData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.profit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <PeriodComparisonCard />
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Weekly Win Rate Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis 
                          dataKey="week" 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [`${value}%`, 'Win Rate']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="winRate" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Monthly View */}
          <TabsContent value="monthly" className="space-y-4">
            <MonthlyPerformanceChart />
            <div className="grid gap-4 lg:grid-cols-2">
              <PeriodComparisonCard />
              <PnLHeatmap />
            </div>
          </TabsContent>

          {/* Take-Profit View */}
          <TabsContent value="takeprofit" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-mono text-green-500">
                      {tpAnalytics.fillRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Overall Fill Rate</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-mono text-foreground">
                      {(tpAnalytics.avgTimeToFill / 60).toFixed(1)}m
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Avg Time to Fill</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="pt-4">
                  <div className="text-center">
                    <div className="text-3xl font-mono text-yellow-500">
                      {tpAnalytics.pendingTPOrders}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Pending Orders</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TakeProfitHistoryChart />
              <TakeProfitStatusPanel />
            </div>

            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Daily Fill Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tpAnalytics.dailyFillRate} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                        tickFormatter={(v) => format(new Date(v), 'MMM dd')}
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'rate') return [`${value.toFixed(1)}%`, 'Fill Rate'];
                          if (name === 'count') return [value, 'Total Orders'];
                          return [value, name];
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="rate" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 0, r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
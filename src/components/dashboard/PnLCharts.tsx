import { useMemo, useState } from 'react';
import { useTrades } from '@/hooks/useTrades';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { PriceChart } from '@/components/charts/PriceChart';

export function PnLCharts() {
  const { trades, dailyStats } = useTrades();
  const [activeTab, setActiveTab] = useState('price');

  const dailyData = useMemo(() => {
    return dailyStats
      .slice()
      .reverse()
      .map(stat => ({
        date: format(new Date(stat.date), 'MMM dd'),
        profit: stat.net_profit,
        trades: stat.total_trades,
        wins: stat.winning_trades,
        losses: stat.losing_trades,
        open: stat.open_price || 0,
        high: stat.high_price || stat.net_profit,
        low: stat.low_price || 0,
        close: stat.close_price || stat.net_profit,
      }));
  }, [dailyStats]);

  const weeklyData = useMemo(() => {
    const weeks: { [key: string]: number } = {};
    const now = new Date();
    
    for (let i = 0; i < 4; i++) {
      const weekStart = subDays(now, (i + 1) * 7);
      const weekEnd = subDays(now, i * 7);
      const weekLabel = `Week ${4 - i}`;
      
      weeks[weekLabel] = trades
        .filter(t => t.status === 'closed' && t.closed_at)
        .filter(t => {
          const closedAt = new Date(t.closed_at!);
          return isWithinInterval(closedAt, { start: startOfDay(weekStart), end: endOfDay(weekEnd) });
        })
        .reduce((sum, t) => sum + (t.net_profit || 0), 0);
    }

    return Object.entries(weeks).map(([week, profit]) => ({ week, profit }));
  }, [trades]);

  const cumulativeData = useMemo(() => {
    let cumulative = 0;
    return dailyData.map(day => {
      cumulative += day.profit;
      return {
        ...day,
        cumulative,
      };
    });
  }, [dailyData]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground">Performance Charts</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="price">Price Chart</TabsTrigger>
            <TabsTrigger value="cumulative">Cumulative P&L</TabsTrigger>
            <TabsTrigger value="daily">Daily P&L</TabsTrigger>
            <TabsTrigger value="weekly">Weekly P&L</TabsTrigger>
          </TabsList>

          <TabsContent value="price" className="mt-0">
            <PriceChart />
          </TabsContent>

          <TabsContent value="cumulative">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative P&L']}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="hsl(var(--primary))"
                    fillOpacity={1}
                    fill="url(#colorProfit)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="daily">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Daily P&L']}
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {dailyData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`}
                        fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="weekly">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="week" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Weekly P&L']}
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {weeklyData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`}
                        fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

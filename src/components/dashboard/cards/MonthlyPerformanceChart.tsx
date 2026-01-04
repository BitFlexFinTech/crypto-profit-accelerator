import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Cell } from "recharts";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { useTrades } from "@/hooks/useTrades";
import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";

export function MonthlyPerformanceChart() {
  const { trades } = useTrades();

  const monthlyData = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.closed_at);
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 11),
      end: now,
    });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthTrades = closedTrades.filter(t => {
        const closeDate = new Date(t.closed_at!);
        return closeDate >= monthStart && closeDate <= monthEnd;
      });

      const profit = monthTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
      const wins = monthTrades.filter(t => (t.net_profit || 0) > 0).length;
      const winRate = monthTrades.length > 0 ? (wins / monthTrades.length) * 100 : 0;

      return {
        month: format(month, 'MMM'),
        fullMonth: format(month, 'MMMM yyyy'),
        profit: Number(profit.toFixed(2)),
        trades: monthTrades.length,
        winRate: Number(winRate.toFixed(1)),
      };
    });
  }, [trades]);

  const bestMonth = useMemo(() => {
    if (monthlyData.length === 0) return null;
    return monthlyData.reduce((best, m) => m.profit > best.profit ? m : best);
  }, [monthlyData]);

  const worstMonth = useMemo(() => {
    if (monthlyData.length === 0) return null;
    return monthlyData.reduce((worst, m) => m.profit < worst.profit ? m : worst);
  }, [monthlyData]);

  const totalProfit = monthlyData.reduce((sum, m) => sum + m.profit, 0);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Monthly Performance
          </CardTitle>
          <span className={`text-sm font-mono ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} USDT
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="month" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                yAxisId="profit"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis 
                yAxisId="winRate"
                orientation="right"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'profit') return [`$${value.toFixed(2)}`, 'Profit'];
                  if (name === 'winRate') return [`${value}%`, 'Win Rate'];
                  return [value, name];
                }}
                labelFormatter={(label) => {
                  const item = monthlyData.find(m => m.month === label);
                  return item ? item.fullMonth : label;
                }}
              />
              <Bar 
                yAxisId="profit"
                dataKey="profit" 
                radius={[4, 4, 0, 0]}
              >
                {monthlyData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={entry.profit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'}
                  />
                ))}
              </Bar>
              <Line 
                yAxisId="winRate"
                type="monotone" 
                dataKey="winRate" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Best/Worst Month Indicators */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {bestMonth && (
            <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-1 text-xs text-green-500">
                <TrendingUp className="h-3 w-3" />
                Best Month
              </div>
              <div className="text-sm font-medium text-foreground">{bestMonth.fullMonth}</div>
              <div className="text-xs text-green-500">+${bestMonth.profit.toFixed(2)}</div>
            </div>
          )}
          {worstMonth && worstMonth.profit < 0 && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-1 text-xs text-red-500">
                <TrendingDown className="h-3 w-3" />
                Worst Month
              </div>
              <div className="text-sm font-medium text-foreground">{worstMonth.fullMonth}</div>
              <div className="text-xs text-red-500">${worstMonth.profit.toFixed(2)}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
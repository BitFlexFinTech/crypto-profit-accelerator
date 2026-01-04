import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

export function TradeVelocityChart() {
  const { trades } = useTrading();

  const hourlyData = useMemo(() => {
    const now = new Date();
    const hours: { hour: string; count: number; profitable: number; losing: number }[] = [];
    
    // Create 24 hour buckets
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourLabel = hourDate.getHours().toString().padStart(2, '0');
      hours.push({
        hour: hourLabel,
        count: 0,
        profitable: 0,
        losing: 0,
      });
    }

    // Count trades per hour
    trades.forEach(trade => {
      if (!trade.created_at) return;
      
      const tradeTime = new Date(trade.created_at);
      const hoursDiff = Math.floor((now.getTime() - tradeTime.getTime()) / (60 * 60 * 1000));
      
      if (hoursDiff >= 0 && hoursDiff < 24) {
        const idx = 23 - hoursDiff;
        if (hours[idx]) {
          hours[idx].count++;
          if (trade.net_profit && trade.net_profit > 0) {
            hours[idx].profitable++;
          } else if (trade.net_profit && trade.net_profit < 0) {
            hours[idx].losing++;
          }
        }
      }
    });

    return hours;
  }, [trades]);

  const totalTrades24h = hourlyData.reduce((sum, h) => sum + h.count, 0);
  const avgPerHour = (totalTrades24h / 24).toFixed(1);
  const currentHourTrades = hourlyData[hourlyData.length - 1]?.count || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Trade Velocity
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            Avg: {avgPerHour}/hr
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3 text-sm">
          <div>
            <span className="text-2xl font-bold">{totalTrades24h}</span>
            <span className="text-muted-foreground ml-1">trades (24h)</span>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold text-primary">{currentHourTrades}</span>
            <span className="text-muted-foreground ml-1 text-xs">this hour</span>
          </div>
        </div>
        
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-2 text-xs shadow-lg">
                        <div className="font-semibold">{data.hour}:00</div>
                        <div>Total: {data.count}</div>
                        <div className="text-green-500">Profitable: {data.profitable}</div>
                        <div className="text-red-500">Losing: {data.losing}</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {hourlyData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={
                      index === hourlyData.length - 1 
                        ? 'hsl(var(--primary))' 
                        : entry.profitable > entry.losing 
                          ? 'hsl(var(--chart-2))' 
                          : entry.losing > entry.profitable
                            ? 'hsl(var(--destructive) / 0.7)'
                            : 'hsl(var(--muted-foreground) / 0.3)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

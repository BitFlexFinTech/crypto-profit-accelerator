import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

export function TradeVelocityChart() {
  const { trades } = useTrading();

  const hourlyData = useMemo(() => {
    const now = new Date();
    const hours: { hour: string; count: number; profitable: number; losing: number }[] = [];
    
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
  const currentHourTrades = hourlyData[hourlyData.length - 1]?.count || 0;

  return (
    <Card className="h-[200px] overflow-hidden">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            Trade Velocity
          </CardTitle>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {(totalTrades24h / 24).toFixed(1)}/hr avg
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="flex items-center justify-between mb-2 text-xs">
          <div>
            <span className="text-xl font-bold tabular-nums">{totalTrades24h}</span>
            <span className="text-muted-foreground ml-1">trades (24h)</span>
          </div>
          <div className="text-right">
            <span className="text-base font-semibold text-primary tabular-nums">{currentHourTrades}</span>
            <span className="text-muted-foreground ml-1 text-[10px]">this hour</span>
          </div>
        </div>
        
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 8 }} 
                tickLine={false}
                axisLine={false}
                interval={5}
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

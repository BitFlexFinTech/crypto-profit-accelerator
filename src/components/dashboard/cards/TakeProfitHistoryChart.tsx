import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ZAxis } from "recharts";
import { Target, Circle } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useTrades } from "@/hooks/useTrades";
import { useMemo } from "react";
import { format, subDays } from "date-fns";

interface TPEvent {
  time: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  symbol: string;
  direction: string;
  timestamp: string;
}

export function TakeProfitHistoryChart() {
  const { positions } = useTrading();
  const { trades } = useTrades();

  const tpEvents = useMemo(() => {
    const events: TPEvent[] = [];
    const cutoff = subDays(new Date(), 7);

    // Add events from current positions
    positions.forEach(p => {
      if (p.take_profit_price && p.opened_at) {
        const openedAt = new Date(p.opened_at);
        if (openedAt >= cutoff) {
          events.push({
            time: openedAt.getTime(),
            price: p.take_profit_price,
            status: (p.take_profit_status as 'pending' | 'filled' | 'cancelled') || 'pending',
            symbol: p.symbol,
            direction: p.direction,
            timestamp: format(openedAt, 'MMM dd HH:mm'),
          });
        }
      }
    });

    // Add events from closed trades
    trades.forEach(t => {
      if (t.status === 'closed' && t.closed_at) {
        const closedAt = new Date(t.closed_at);
        if (closedAt >= cutoff && t.exit_price) {
          // Infer TP status from profit
          const status = (t.net_profit || 0) > 0 ? 'filled' : 'cancelled';
          events.push({
            time: closedAt.getTime(),
            price: t.exit_price,
            status,
            symbol: t.symbol,
            direction: t.direction,
            timestamp: format(closedAt, 'MMM dd HH:mm'),
          });
        }
      }
    });

    return events.sort((a, b) => a.time - b.time);
  }, [positions, trades]);

  const stats = useMemo(() => {
    const filled = tpEvents.filter(e => e.status === 'filled').length;
    const cancelled = tpEvents.filter(e => e.status === 'cancelled').length;
    const pending = tpEvents.filter(e => e.status === 'pending').length;
    const fillRate = tpEvents.length > 0 ? (filled / (filled + cancelled)) * 100 : 0;
    
    return { filled, cancelled, pending, fillRate, total: tpEvents.length };
  }, [tpEvents]);

  const getColor = (status: string) => {
    switch (status) {
      case 'filled': return 'hsl(var(--chart-2))';
      case 'cancelled': return 'hsl(var(--destructive))';
      case 'pending': return 'hsl(var(--chart-4))';
      default: return 'hsl(var(--muted))';
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Take-Profit Order Timeline (7 Days)
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {stats.fillRate.toFixed(1)}% Fill Rate
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tpEvents.length > 0 ? (
          <>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis 
                    dataKey="time" 
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => format(new Date(v), 'MMM dd')}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    dataKey="price" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  <ZAxis range={[50, 150]} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    content={({ payload }) => {
                      if (!payload || !payload[0]) return null;
                      const data = payload[0].payload as TPEvent;
                      return (
                        <div className="p-2">
                          <div className="font-medium">{data.symbol} {data.direction.toUpperCase()}</div>
                          <div className="text-muted-foreground">TP @ ${data.price.toFixed(4)}</div>
                          <div className={`capitalize ${
                            data.status === 'filled' ? 'text-green-500' :
                            data.status === 'cancelled' ? 'text-red-500' :
                            'text-yellow-500'
                          }`}>
                            {data.status}
                          </div>
                          <div className="text-xs text-muted-foreground">{data.timestamp}</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={tpEvents} shape="circle">
                    {tpEvents.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getColor(entry.status)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              <div className="text-center p-2 rounded bg-muted/30">
                <div className="text-lg font-mono text-foreground">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-2 rounded bg-green-500/10">
                <div className="text-lg font-mono text-green-500">{stats.filled}</div>
                <div className="text-xs text-muted-foreground">Filled</div>
              </div>
              <div className="text-center p-2 rounded bg-red-500/10">
                <div className="text-lg font-mono text-red-500">{stats.cancelled}</div>
                <div className="text-xs text-muted-foreground">Cancelled</div>
              </div>
              <div className="text-center p-2 rounded bg-yellow-500/10">
                <div className="text-lg font-mono text-yellow-500">{stats.pending}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Circle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <div className="text-sm">No take-profit orders in the last 7 days</div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Filled</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Cancelled</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
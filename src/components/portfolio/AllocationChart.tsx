import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Layers } from 'lucide-react';

export function AllocationChart() {
  const { balances, positions, trades } = useTrading();

  // Calculate allocation metrics
  const totalBalance = balances.reduce((sum, b) => sum + (b.total || 0), 0);
  const lockedInPositions = positions.reduce((sum, p) => sum + (p.order_size_usd || 0), 0);
  const availableForTrading = totalBalance - lockedInPositions;
  
  // Calculate realized profits
  const realizedProfit = trades
    .filter(t => t.status === 'closed')
    .reduce((sum, t) => sum + (t.net_profit || 0), 0);

  // Calculate unrealized P&L
  const unrealizedPnL = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  const data = [
    {
      name: 'Available',
      value: Math.max(0, availableForTrading),
      color: 'hsl(var(--primary))',
    },
    {
      name: 'In Positions',
      value: lockedInPositions,
      color: 'hsl(var(--warning))',
    },
    {
      name: 'Unrealized P&L',
      value: Math.abs(unrealizedPnL),
      color: unrealizedPnL >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
      isNegative: unrealizedPnL < 0,
    },
    {
      name: 'Realized Profit',
      value: Math.abs(realizedProfit),
      color: realizedProfit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))',
      isNegative: realizedProfit < 0,
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {item.isNegative ? '-' : ''}${item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Capital Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalBalance === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No balance data available
          </div>
        ) : (
          <>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    width={100}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
                  <Bar 
                    dataKey="value" 
                    radius={[0, 4, 4, 0]}
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
              <div className="animate-fade-in">
                <p className="text-xs text-muted-foreground">Utilization Rate</p>
                <p className="text-lg font-bold text-foreground">
                  {totalBalance > 0 ? ((lockedInPositions / totalBalance) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
                <p className="text-xs text-muted-foreground">Active Positions</p>
                <p className="text-lg font-bold text-foreground">{positions.length}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

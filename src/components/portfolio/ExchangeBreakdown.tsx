import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Building2, Coins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--warning))'];

const ASSET_COLORS: Record<string, string> = {
  'USDT': 'hsl(var(--success))',
  'USDC': 'hsl(var(--chart-2))',
  'BTC': 'hsl(45, 93%, 47%)',
  'ETH': 'hsl(230, 80%, 60%)',
  'SOL': 'hsl(280, 70%, 55%)',
  'BNB': 'hsl(40, 90%, 50%)',
  'DOGE': 'hsl(35, 85%, 55%)',
  'AVAX': 'hsl(0, 70%, 55%)',
  'LINK': 'hsl(220, 75%, 55%)',
};

export function ExchangeBreakdown() {
  const { balances, exchanges } = useTrading();

  // Group balances by exchange with asset breakdown
  const exchangeData = exchanges
    .filter(e => e.is_connected)
    .map(exchange => {
      const exchangeBalances = balances.filter(b => b.exchange_id === exchange.id);
      const assets = exchangeBalances.map(b => ({
        currency: b.currency || 'USDT',
        total: b.total || 0,
        available: b.available || 0,
        locked: b.locked || 0,
      }));
      
      const totalUsd = assets.reduce((sum, a) => sum + a.total, 0);
      
      return {
        id: exchange.id,
        name: exchange.exchange.charAt(0).toUpperCase() + exchange.exchange.slice(1),
        assets,
        totalUsd,
      };
    })
    .filter(e => e.totalUsd > 0);

  const pieData = exchangeData.map(e => ({
    name: e.name,
    value: e.totalUsd,
  }));

  const totalValue = pieData.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percentage = ((item.value / totalValue) * 100).toFixed(1);
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-primary">{percentage}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Exchange Balances
        </CardTitle>
      </CardHeader>
      <CardContent>
        {exchangeData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No exchange balances found
          </div>
        ) : (
          <>
            {/* Pie Chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    formatter={(value, entry: any) => (
                      <span className="text-sm text-foreground">
                        {value} ({((entry.payload.value / totalValue) * 100).toFixed(0)}%)
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Exchange breakdown with assets */}
            <div className="mt-4 space-y-4">
              {exchangeData.map((exchange, i) => (
                <div 
                  key={exchange.id} 
                  className="border border-border rounded-lg p-3 animate-fade-in"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  {/* Exchange header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[i % COLORS.length] }} 
                      />
                      <span className="font-medium text-foreground">{exchange.name}</span>
                    </div>
                    <span className="font-bold text-foreground tabular-nums">
                      ${exchange.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {/* Asset list */}
                  <div className="space-y-1.5 pl-5">
                    {exchange.assets.map((asset, j) => (
                      <div 
                        key={`${exchange.id}-${asset.currency}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className="text-xs px-1.5 py-0"
                            style={{ 
                              borderColor: ASSET_COLORS[asset.currency] || 'hsl(var(--muted))',
                              color: ASSET_COLORS[asset.currency] || 'hsl(var(--foreground))'
                            }}
                          >
                            {asset.currency}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground tabular-nums">
                            ${asset.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {asset.locked > 0 && (
                            <span className="text-xs text-warning">
                              🔒 ${asset.locked.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Total Portfolio
              </span>
              <span className="font-bold text-lg text-foreground tabular-nums">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

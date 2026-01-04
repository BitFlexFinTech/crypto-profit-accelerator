import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Flame } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface VolatilityItem {
  symbol: string;
  volatility: number;
  trend: 'up' | 'down' | 'neutral';
  change24h: number;
}

export function VolatilityScanner() {
  const { marketData } = useTrading();

  const items: VolatilityItem[] = Object.values(marketData)
    .filter(data => data && data.symbol && data.volatility !== undefined)
    .map(data => {
      const trend: 'up' | 'down' | 'neutral' = 
        data.change24h > 0.5 ? 'up' : 
        data.change24h < -0.5 ? 'down' : 'neutral';
      
      return {
        symbol: data.symbol,
        volatility: Math.min(data.volatility * 10, 100),
        trend,
        change24h: data.change24h,
      };
    })
    .sort((a, b) => b.volatility - a.volatility)
    .slice(0, 5);

  const getVolatilityColor = (vol: number) => {
    if (vol >= 70) return 'text-destructive bg-destructive/20';
    if (vol >= 40) return 'text-warning bg-warning/20';
    return 'text-primary bg-primary/20';
  };

  const getVolatilityLabel = (vol: number) => {
    if (vol >= 70) return 'HIGH';
    if (vol >= 40) return 'MED';
    return 'LOW';
  };

  return (
    <Card className="h-[200px] overflow-hidden flex flex-col">
      <CardHeader className="py-2 px-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Volatility
          </CardTitle>
          {items.length > 0 && (
            <Activity className="h-3 w-3 text-muted-foreground animate-pulse" />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 overflow-y-auto scrollbar-thin space-y-1.5">
        {items.length === 0 ? (
          <div className="p-3 text-center text-muted-foreground text-xs">
            Waiting for data...
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={item.symbol}
              className="flex items-center gap-2 p-1.5 rounded bg-secondary/30"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium">{item.symbol}</span>
                  <span className={cn(
                    "text-[9px] font-bold px-1 py-0.5 rounded",
                    getVolatilityColor(item.volatility)
                  )}>
                    {getVolatilityLabel(item.volatility)}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      item.volatility >= 70 ? 'bg-destructive' :
                      item.volatility >= 40 ? 'bg-warning' : 'bg-primary'
                    )}
                    style={{ width: `${item.volatility}%` }}
                  />
                </div>
              </div>
              
              <div className={cn(
                "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold",
                item.trend === 'up' ? 'bg-primary/20 text-primary' :
                item.trend === 'down' ? 'bg-destructive/20 text-destructive' :
                'bg-secondary text-muted-foreground'
              )}>
                {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

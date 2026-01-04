import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Flame } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface VolatilityItem {
  symbol: string;
  volatility: number;
  trend: 'up' | 'down' | 'neutral';
  recommendation: string;
}

export function VolatilityScanner() {
  const { signals, prices } = useTrading();
  const [items, setItems] = useState<VolatilityItem[]>([]);

  useEffect(() => {
    // Generate volatility data from signals
    const volatilityItems: VolatilityItem[] = signals.map(signal => ({
      symbol: signal.symbol,
      volatility: signal.volatility === 'high' ? 85 + Math.random() * 15 :
                  signal.volatility === 'medium' ? 50 + Math.random() * 35 :
                  Math.random() * 50,
      trend: signal.momentum === 'bullish' ? 'up' : signal.momentum === 'bearish' ? 'down' : 'neutral',
      recommendation: signal.direction === 'long' ? 'BUY' : 'SELL',
    }));

    // Add some default pairs if no signals
    if (volatilityItems.length === 0 && Object.keys(prices).length > 0) {
      Object.keys(prices).slice(0, 6).forEach(symbol => {
        volatilityItems.push({
          symbol,
          volatility: 30 + Math.random() * 40,
          trend: Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'neutral',
          recommendation: Math.random() > 0.5 ? 'BUY' : 'SELL',
        });
      });
    }

    // Sort by volatility
    volatilityItems.sort((a, b) => b.volatility - a.volatility);
    setItems(volatilityItems.slice(0, 6));
  }, [signals, prices]);

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
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Volatility Scanner
          </CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No volatility data available
          </div>
        ) : (
          items.map((item, i) => (
            <div
              key={item.symbol}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-all duration-300",
                "hover:bg-secondary/50 animate-fade-in"
              )}
              style={{ animationDelay: `${i * 75}ms` }}
            >
              {/* Volatility Bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{item.symbol}</span>
                  <span className={cn(
                    "text-xs font-bold px-1.5 py-0.5 rounded",
                    getVolatilityColor(item.volatility)
                  )}>
                    {getVolatilityLabel(item.volatility)}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
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
              
              {/* Trend & Recommendation */}
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                  item.trend === 'up' ? 'bg-primary/20 text-primary' :
                  item.trend === 'down' ? 'bg-destructive/20 text-destructive' :
                  'bg-secondary text-muted-foreground'
                )}>
                  {item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→'}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

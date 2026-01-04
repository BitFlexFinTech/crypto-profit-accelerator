import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  volatility: 'low' | 'medium' | 'high';
}

export function MarketScanner() {
  const { prices, signals, connectionStates } = useTrading();
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    // Generate market data from prices and signals
    const newMarkets: MarketItem[] = Object.entries(prices).map(([symbol, price]) => {
      const signal = signals.find(s => s.symbol === symbol);
      const prevPrice = prevPrices[symbol] || price;
      const change = ((price - prevPrice) / prevPrice) * 100;
      
      return {
        symbol,
        price,
        change: isNaN(change) ? 0 : change,
        volume: Math.random() * 1000000,
        volatility: signal?.volatility || (Math.abs(change) > 0.5 ? 'high' : Math.abs(change) > 0.2 ? 'medium' : 'low'),
      };
    });
    
    // Sort by volatility/change
    newMarkets.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    setMarkets(newMarkets.slice(0, 8));
    setPrevPrices(prices);
  }, [prices, signals]);

  const isConnected = Object.values(connectionStates).some(s => s.connected);

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Market Scanner
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn(
              "h-2 w-2 rounded-full animate-pulse",
              isConnected ? "bg-primary" : "bg-destructive"
            )} />
            <span className="text-xs text-muted-foreground">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border max-h-[300px] overflow-y-auto scrollbar-thin">
          {markets.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Connect exchanges to see market data
            </div>
          ) : (
            markets.map((market, i) => (
              <div
                key={market.symbol}
                className={cn(
                  "flex items-center justify-between p-3 transition-all duration-300",
                  "hover:bg-secondary/50",
                  market.change > 0 ? "animate-fade-in" : ""
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    market.volatility === 'high' ? 'bg-destructive/20 text-destructive' :
                    market.volatility === 'medium' ? 'bg-warning/20 text-warning' :
                    'bg-primary/20 text-primary'
                  )}>
                    {market.symbol.split('/')[0].slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{market.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      Vol: {(market.volume / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-mono text-sm font-medium transition-colors duration-300",
                    market.change > 0 ? "text-primary" : market.change < 0 ? "text-destructive" : "text-foreground"
                  )}>
                    ${market.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <div className="flex items-center justify-end gap-1">
                    {market.change >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-primary" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      market.change >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

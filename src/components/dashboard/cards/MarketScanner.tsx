import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
  volume: number;
  volatility: 'low' | 'medium' | 'high';
  priceDirection: 'up' | 'down' | 'neutral';
}

export function MarketScanner() {
  const { prices, marketData, connectionStates } = useTrading();
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const newMarkets: MarketItem[] = Object.entries(prices).map(([symbol, price]) => {
      const data = marketData[symbol];
      const prevPrice = prevPricesRef.current[symbol] || price;
      const priceDirection: 'up' | 'down' | 'neutral' = price > prevPrice ? 'up' : price < prevPrice ? 'down' : 'neutral';
      
      // Use real data from WebSocket
      const change24h = data?.change24h || 0;
      const volume24h = data?.volume24h || 0;
      const volatility = data?.volatility || 0;
      
      return {
        symbol,
        price,
        change: change24h,
        volume: volume24h,
        volatility: volatility > 5 ? 'high' : volatility > 2 ? 'medium' : 'low',
        priceDirection,
      };
    });
    
    // Sort by volatility/change (most volatile first)
    newMarkets.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    setMarkets(newMarkets.slice(0, 8));
    
    // Store current prices for next comparison
    prevPricesRef.current = { ...prices };
  }, [prices, marketData]);

  const isConnected = Object.values(connectionStates).some(s => s.connected);

  const formatVolume = (vol: number): string => {
    if (vol >= 1000000000) return `${(vol / 1000000000).toFixed(1)}B`;
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toFixed(0);
  };

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
              "h-2 w-2 rounded-full",
              isConnected ? "bg-primary animate-pulse" : "bg-destructive"
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
              {isConnected ? 'Loading market data...' : 'Connect exchanges to see market data'}
            </div>
          ) : (
            markets.map((market, i) => (
              <div
                key={market.symbol}
                className={cn(
                  "flex items-center justify-between p-3 transition-all duration-300",
                  "hover:bg-secondary/50",
                  market.priceDirection === 'up' && "bg-primary/5",
                  market.priceDirection === 'down' && "bg-destructive/5"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300",
                    market.volatility === 'high' ? 'bg-destructive/20 text-destructive' :
                    market.volatility === 'medium' ? 'bg-warning/20 text-warning' :
                    'bg-primary/20 text-primary'
                  )}>
                    {market.symbol.split('/')[0].slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{market.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      Vol: {formatVolume(market.volume)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-mono text-sm font-medium transition-colors duration-300",
                    market.priceDirection === 'up' ? "text-primary" : 
                    market.priceDirection === 'down' ? "text-destructive" : 
                    "text-foreground"
                  )}>
                    ${market.price.toLocaleString(undefined, { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: market.price < 1 ? 6 : 2 
                    })}
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

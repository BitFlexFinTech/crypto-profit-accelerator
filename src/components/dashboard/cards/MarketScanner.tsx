import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';
import { LiveBadge } from '@/components/ui/live-badge';

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
    
    newMarkets.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    setMarkets(newMarkets.slice(0, 6));
    
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
    <Card className="overflow-hidden flex flex-col h-full">
      <CardHeader className="py-2 px-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Market Scanner
          </CardTitle>
          <LiveBadge isLive={isConnected} />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="divide-y divide-border overflow-y-auto h-full scrollbar-thin">
          {markets.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              {isConnected ? 'Loading...' : 'Connect exchanges'}
            </div>
          ) : (
            markets.map((market, i) => (
              <div
                key={market.symbol}
                className={cn(
                  "flex items-center justify-between px-3 py-2 transition-all duration-300",
                  "hover:bg-secondary/50",
                  market.priceDirection === 'up' && "bg-primary/5",
                  market.priceDirection === 'down' && "bg-destructive/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                    market.volatility === 'high' ? 'bg-destructive/20 text-destructive' :
                    market.volatility === 'medium' ? 'bg-warning/20 text-warning' :
                    'bg-primary/20 text-primary'
                  )}>
                    {market.symbol.split('/')[0].slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-medium text-xs">{market.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Vol: {formatVolume(market.volume)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-mono text-xs font-medium tabular-nums",
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
                      <TrendingUp className="h-2.5 w-2.5 text-primary" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 text-destructive" />
                    )}
                    <span className={cn(
                      "text-[10px] font-medium tabular-nums",
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

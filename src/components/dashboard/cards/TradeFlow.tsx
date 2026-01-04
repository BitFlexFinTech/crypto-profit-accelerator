import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface TradeFlowItem {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  price: number;
  size: number;
  profit?: number;
  timestamp: Date;
  status: 'open' | 'closed';
}

export function TradeFlow() {
  const { trades, positions } = useTrading();
  const [flowItems, setFlowItems] = useState<TradeFlowItem[]>([]);

  useEffect(() => {
    // Combine recent trades and open positions
    const items: TradeFlowItem[] = [
      ...positions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        price: p.entry_price,
        size: p.order_size_usd,
        profit: p.unrealized_pnl,
        timestamp: new Date(p.opened_at || Date.now()),
        status: 'open' as const,
      })),
      ...trades.slice(0, 10).map(t => ({
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        price: t.entry_price,
        size: t.order_size_usd,
        profit: t.net_profit || 0,
        timestamp: new Date(t.created_at || Date.now()),
        status: t.status === 'open' ? 'open' as const : 'closed' as const,
      })),
    ];

    // Sort by timestamp, most recent first
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFlowItems(items.slice(0, 8));
  }, [trades, positions]);

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Trade Flow
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {flowItems.filter(f => f.status === 'open').length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border max-h-[300px] overflow-y-auto scrollbar-thin">
          {flowItems.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No recent trades
            </div>
          ) : (
            flowItems.map((item, i) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between p-3 transition-all duration-500",
                  "hover:bg-secondary/50",
                  item.status === 'open' && "bg-primary/5"
                )}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    item.direction === 'long' ? 'bg-primary/20' : 'bg-destructive/20'
                  )}>
                    {item.direction === 'long' ? (
                      <ArrowUpRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.symbol}</p>
                      {item.status === 'open' && (
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(item.timestamp, 'HH:mm:ss')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">${item.size.toFixed(0)}</p>
                  {item.profit !== undefined && (
                    <p className={cn(
                      "text-xs font-medium",
                      item.profit >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

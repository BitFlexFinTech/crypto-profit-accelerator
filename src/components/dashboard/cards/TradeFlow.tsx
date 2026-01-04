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
      ...trades.slice(0, 8).map(t => ({
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

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setFlowItems(items.slice(0, 6));
  }, [trades, positions]);

  return (
    <Card className="overflow-hidden flex flex-col h-full">
      <CardHeader className="py-2 px-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Trade Flow
          </CardTitle>
          <Badge variant="outline" className="text-[10px] px-1.5">
            {flowItems.filter(f => f.status === 'open').length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="divide-y divide-border overflow-y-auto h-full scrollbar-thin">
          {flowItems.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              No recent trades
            </div>
          ) : (
            flowItems.map((item, i) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 transition-all duration-300",
                  "hover:bg-secondary/50",
                  item.status === 'open' && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    item.direction === 'long' ? 'bg-primary/20' : 'bg-destructive/20'
                  )}>
                    {item.direction === 'long' ? (
                      <ArrowUpRight className="h-3 w-3 text-primary" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-xs">{item.symbol}</p>
                      {item.status === 'open' && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {format(item.timestamp, 'HH:mm:ss')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs tabular-nums">${item.size.toFixed(0)}</p>
                  {item.profit !== undefined && (
                    <p className={cn(
                      "text-[10px] font-medium tabular-nums",
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

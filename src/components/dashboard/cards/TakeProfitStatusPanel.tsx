import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Clock, CheckCircle, XCircle, Timer } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useTrades } from "@/hooks/useTrades";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

export function TakeProfitStatusPanel() {
  const { positions } = useTrading();
  const { trades } = useTrades();

  const pendingTPOrders = useMemo(() => {
    return positions
      .filter(p => p.take_profit_order_id && p.take_profit_status === 'pending')
      .map(p => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        entryPrice: p.entry_price,
        currentPrice: p.current_price || p.entry_price,
        tpPrice: p.take_profit_price!,
        orderId: p.take_profit_order_id!,
        openedAt: p.opened_at,
        progress: p.direction === 'long'
          ? ((p.current_price || p.entry_price) - p.entry_price) / (p.take_profit_price! - p.entry_price) * 100
          : (p.entry_price - (p.current_price || p.entry_price)) / (p.entry_price - p.take_profit_price!) * 100,
      }))
      .sort((a, b) => b.progress - a.progress);
  }, [positions]);

  const recentFills = useMemo(() => {
    return trades
      .filter(t => t.status === 'closed' && (t.net_profit || 0) > 0)
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        direction: t.direction,
        profit: t.net_profit || 0,
        closedAt: t.closed_at,
      }));
  }, [trades]);

  const stats = useMemo(() => {
    const allClosed = trades.filter(t => t.status === 'closed');
    const wins = allClosed.filter(t => (t.net_profit || 0) > 0);
    const avgTimeToFill = wins
      .filter(t => t.opened_at && t.closed_at)
      .reduce((sum, t) => {
        const duration = new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime();
        return sum + duration;
      }, 0) / (wins.length || 1);

    return {
      fillRate: allClosed.length > 0 ? (wins.length / allClosed.length) * 100 : 0,
      avgTimeToFill: avgTimeToFill / 1000 / 60, // in minutes
      pendingCount: pendingTPOrders.length,
    };
  }, [trades, pendingTPOrders]);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Take-Profit Orders
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {pendingTPOrders.length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded bg-muted/30">
            <div className="text-lg font-mono text-green-500">{stats.fillRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">Fill Rate</div>
          </div>
          <div className="text-center p-2 rounded bg-muted/30">
            <div className="text-lg font-mono text-foreground">{stats.avgTimeToFill.toFixed(1)}m</div>
            <div className="text-xs text-muted-foreground">Avg Fill Time</div>
          </div>
          <div className="text-center p-2 rounded bg-muted/30">
            <div className="text-lg font-mono text-yellow-500">{stats.pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
        </div>

        {/* Pending TP Orders */}
        <div>
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Active Take-Profit Orders
          </div>
          {pendingTPOrders.length > 0 ? (
            <div className="space-y-2 max-h-[150px] overflow-y-auto">
              {pendingTPOrders.map(order => (
                <div 
                  key={order.id} 
                  className="p-2 rounded bg-muted/20 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{order.symbol}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${order.direction === 'long' ? 'text-green-500' : 'text-red-500'}`}
                      >
                        {order.direction.toUpperCase()}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      TP: ${order.tpPrice.toFixed(4)}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`absolute left-0 top-0 h-full transition-all ${
                        order.progress >= 80 ? 'bg-green-500' :
                        order.progress >= 50 ? 'bg-yellow-500' :
                        'bg-primary'
                      }`}
                      style={{ width: `${Math.min(Math.max(order.progress, 0), 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      ${order.currentPrice.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {order.progress.toFixed(1)}% to TP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-4">
              No active take-profit orders
            </div>
          )}
        </div>

        {/* Recent Fills */}
        <div>
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            Recent Fills
          </div>
          {recentFills.length > 0 ? (
            <div className="space-y-1">
              {recentFills.map(fill => (
                <div 
                  key={fill.id}
                  className="flex items-center justify-between p-1.5 rounded bg-green-500/10 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{fill.symbol}</span>
                    <span className={fill.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                      {fill.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500 font-mono">+${fill.profit.toFixed(2)}</span>
                    {fill.closedAt && (
                      <span className="text-muted-foreground text-[10px]">
                        {formatDistanceToNow(new Date(fill.closedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No recent fills
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
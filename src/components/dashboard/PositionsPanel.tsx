import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, AlertTriangle, Loader2, X } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function PositionsPanel() {
  const { positions, loading, closePosition, closeAllPositions, exchanges, prices } = useTrading();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  const getExchangeName = (exchangeId?: string) => {
    if (!exchangeId) return 'Unk';
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return 'Unk';
    const config = EXCHANGE_CONFIGS.find(c => c.name === exchange.exchange);
    return config?.displayName?.slice(0, 3) || exchange.exchange.slice(0, 3);
  };

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

  const handleClosePosition = async (positionId: string, pnl: number, profitTarget: number, symbol: string) => {
    if (pnl < profitTarget) {
      toast.error(`Cannot close ${symbol}`, {
        description: `Need +$${profitTarget.toFixed(2)}, at ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        dismissible: true,
      });
      return;
    }
    
    setClosingPositionId(positionId);
    try {
      await closePosition(positionId);
      toast.success('Position Closed', { dismissible: true });
    } catch {
      toast.error('Failed to close', { dismissible: true });
    } finally {
      setClosingPositionId(null);
    }
  };

  const handleCloseAll = async () => {
    const profitable = positions.filter(p => p.unrealized_pnl >= p.profit_target);
    if (profitable.length === 0) {
      toast.error('No positions at target', { dismissible: true });
      return;
    }
    
    try {
      await closeAllPositions();
      toast.success(`Closed ${profitable.length} positions`, { dismissible: true });
    } catch {
      toast.error('Failed', { dismissible: true });
    }
  };

  if (loading) {
    return (
      <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
        <CardHeader className="py-1.5 px-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between flex-shrink-0 py-1.5 px-2">
        <div>
          <CardTitle className="text-xs text-foreground">Positions</CardTitle>
          <p className="text-[10px] text-muted-foreground">
            {positions.length} open • 
            <span className={totalPnl >= 0 ? ' text-primary' : ' text-destructive'}>
              {' '}${totalPnl.toFixed(2)}
            </span>
          </p>
        </div>
        {positions.length > 0 && (
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleCloseAll}
            className="h-5 px-1.5 text-[10px] gap-0.5"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            Close All
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
        {positions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-xs">No positions</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1 p-1.5">
              {positions.map((position) => {
                const pnlPercent = position.entry_price > 0 
                  ? ((position.unrealized_pnl / position.order_size_usd) * 100)
                  : 0;
                const currentPrice = prices[position.symbol] || position.current_price;
                const isClosing = closingPositionId === position.id;
                const canClose = position.unrealized_pnl >= position.profit_target;
                const progressPct = Math.min(100, Math.max(0, (position.unrealized_pnl / position.profit_target) * 100));
                
                return (
                  <div 
                    key={position.id}
                    className="p-1.5 rounded bg-secondary/50 border border-border/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="flex flex-col items-center w-8 flex-shrink-0">
                          <Badge 
                            variant={position.direction === 'long' ? 'default' : 'destructive'}
                            className="text-[8px] px-1 py-0"
                          >
                            {position.direction === 'long' ? <TrendingUp className="h-2 w-2" /> : <TrendingDown className="h-2 w-2" />}
                          </Badge>
                          <span className="text-[8px] text-muted-foreground mt-0.5">
                            {getExchangeName(position.exchange_id)}
                          </span>
                        </div>
                        
                        <div className="min-w-0 border-l border-border pl-1.5">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-foreground text-xs truncate">
                              {position.symbol}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-0.5 py-0">
                              {position.trade_type[0]}
                            </Badge>
                            {position.leverage && position.leverage > 1 && (
                              <span className="text-[8px] text-muted-foreground">{position.leverage}x</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                            <span>${position.entry_price.toFixed(2)}</span>
                            <span>→</span>
                            <span className="text-foreground">${currentPrice?.toFixed(2) || '-'}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="text-right">
                          <div className={cn("font-mono text-xs font-medium", position.unrealized_pnl >= 0 ? 'text-primary' : 'text-destructive')}>
                            {position.unrealized_pnl >= 0 ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                          </div>
                          <div className={cn("text-[9px]", pnlPercent >= 0 ? 'text-primary' : 'text-destructive')}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant={canClose ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleClosePosition(position.id, position.unrealized_pnl, position.profit_target, position.symbol)}
                            disabled={isClosing || !canClose}
                            className={cn(
                              "h-5 px-1.5 text-[10px] gap-0.5",
                              canClose 
                                ? "bg-primary hover:bg-primary/90" 
                                : "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {isClosing ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : canClose ? (
                              <TrendingUp className="h-2.5 w-2.5" />
                            ) : (
                              <X className="h-2.5 w-2.5" />
                            )}
                            Close
                          </Button>
                          {!canClose && (
                            <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                              +${(position.profit_target - position.unrealized_pnl).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-300",
                          progressPct >= 100 ? "bg-primary" : progressPct >= 50 ? "bg-yellow-500" : "bg-destructive"
                        )}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
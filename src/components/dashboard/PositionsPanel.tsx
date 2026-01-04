import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { X, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { toast } from 'sonner';

export function PositionsPanel() {
  const { positions, loading, closePosition, closeAllPositions, exchanges } = useTrading();

  const getExchangeName = (exchangeId?: string) => {
    if (!exchangeId) return 'Unknown';
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return 'Unknown';
    const config = EXCHANGE_CONFIGS.find(c => c.name === exchange.exchange);
    return config?.displayName || exchange.exchange;
  };

  const getExchangeLogo = (exchangeId?: string) => {
    if (!exchangeId) return '❓';
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return '❓';
    const config = EXCHANGE_CONFIGS.find(c => c.name === exchange.exchange);
    return config?.logo || '❓';
  };

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

  const handleClosePosition = async (positionId: string) => {
    try {
      await closePosition(positionId);
      toast.success('Position Closed', { dismissible: true });
    } catch {
      toast.error('Failed to close position', { dismissible: true });
    }
  };

  const handleCloseAll = async () => {
    try {
      await closeAllPositions();
      toast.success('All Positions Closed', { dismissible: true });
    } catch {
      toast.error('Failed to close positions', { dismissible: true });
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-foreground">Active Positions</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {positions.length} position{positions.length !== 1 ? 's' : ''} • 
            <span className={totalPnl >= 0 ? ' text-primary' : ' text-destructive'}>
              {' '}${totalPnl.toFixed(2)} unrealized
            </span>
          </p>
        </div>
        {positions.length > 0 && (
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleCloseAll}
            className="gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            Close All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No active positions</p>
            <p className="text-sm mt-1">Positions will appear here when the bot opens trades</p>
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((position) => {
              const pnlPercent = position.entry_price > 0 
                ? ((position.unrealized_pnl / position.order_size_usd) * 100)
                : 0;
              
              return (
                <div 
                  key={position.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getExchangeLogo(position.exchange_id)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{position.symbol}</span>
                        <Badge 
                          variant={position.direction === 'long' ? 'default' : 'destructive'}
                          className={position.direction === 'long' ? 'bg-primary text-primary-foreground' : ''}
                        >
                          {position.direction === 'long' ? (
                            <><TrendingUp className="h-3 w-3 mr-1" />LONG</>
                          ) : (
                            <><TrendingDown className="h-3 w-3 mr-1" />SHORT</>
                          )}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {position.trade_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>{getExchangeName(position.exchange_id)}</span>
                        <span>Entry: ${position.entry_price.toFixed(4)}</span>
                        <span>Size: ${position.order_size_usd.toFixed(2)}</span>
                        {position.leverage && position.leverage > 1 && <span>{position.leverage}x</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`font-mono font-medium ${position.unrealized_pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {position.unrealized_pnl >= 0 ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                      </div>
                      <div className={`text-xs ${pnlPercent >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleClosePosition(position.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

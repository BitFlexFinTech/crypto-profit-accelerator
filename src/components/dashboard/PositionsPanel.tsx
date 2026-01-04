import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { X, TrendingUp, TrendingDown, AlertTriangle, Clock, Target, Loader2 } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function PositionsPanel() {
  const { positions, loading, closePosition, closeAllPositions, exchanges, prices } = useTrading();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [lossConfirmPosition, setLossConfirmPosition] = useState<{ id: string; pnl: number; symbol: string } | null>(null);
  const [isClosing, setIsClosing] = useState(false);

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

  const handleClosePosition = async (positionId: string, pnl: number, symbol: string) => {
    // If position is at a loss, show confirmation dialog
    if (pnl < 0) {
      setLossConfirmPosition({ id: positionId, pnl, symbol });
      return;
    }
    
    await executeClose(positionId);
  };

  const executeClose = async (positionId: string) => {
    setClosingPositionId(positionId);
    setIsClosing(true);
    try {
      await closePosition(positionId);
      toast.success('Position Closed', { dismissible: true });
    } catch {
      toast.error('Failed to close position', { dismissible: true });
    } finally {
      setClosingPositionId(null);
      setIsClosing(false);
      setLossConfirmPosition(null);
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

  // Calculate ETA to profit target
  const getETA = (position: typeof positions[0]) => {
    if (!position.opened_at) return null;
    const elapsedMs = Date.now() - new Date(position.opened_at).getTime();
    const elapsedSec = elapsedMs / 1000;
    
    // Need at least 15 seconds of data and positive progress
    if (elapsedSec < 15 || position.unrealized_pnl <= 0) return null;
    
    const pnlRatePerSec = position.unrealized_pnl / elapsedSec;
    if (pnlRatePerSec <= 0) return null;
    
    const remainingPnl = position.profit_target - position.unrealized_pnl;
    if (remainingPnl <= 0) return 'Target hit!';
    
    const remainingSec = remainingPnl / pnlRatePerSec;
    
    if (remainingSec < 60) return `~${Math.ceil(remainingSec)}s`;
    if (remainingSec < 3600) return `~${Math.ceil(remainingSec / 60)}m`;
    return `~${Math.ceil(remainingSec / 3600)}h`;
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
    <>
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
                const targetProgress = Math.min(100, Math.max(0, (position.unrealized_pnl / position.profit_target) * 100));
                const currentPrice = prices[position.symbol] || position.current_price;
                const eta = getETA(position);
                const isThisClosing = closingPositionId === position.id;
                
                return (
                  <div 
                    key={position.id}
                    className="p-3 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="flex items-center justify-between mb-2">
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
                            <span className="text-foreground font-medium">
                              Now: ${currentPrice?.toFixed(4) || '-'}
                            </span>
                            {position.leverage && position.leverage > 1 && <span>{position.leverage}x</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`font-mono font-medium ${position.unrealized_pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {position.unrealized_pnl >= 0 ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                          </div>
                          <div className={`text-xs ${pnlPercent >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleClosePosition(position.id, position.unrealized_pnl, position.symbol)}
                          disabled={isThisClosing}
                          className="gap-1"
                        >
                          {isThisClosing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                          Close
                        </Button>
                      </div>
                    </div>

                    {/* Progress bar to target */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          <span>Target: ${position.profit_target.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={targetProgress >= 100 ? 'text-primary font-medium' : ''}>
                            {targetProgress.toFixed(0)}%
                          </span>
                          {eta && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              ETA: {eta}
                            </span>
                          )}
                          {position.opened_at && (
                            <span>
                              {formatDistanceToNow(new Date(position.opened_at))} ago
                            </span>
                          )}
                        </div>
                      </div>
                      <Progress 
                        value={targetProgress} 
                        className={`h-2 ${targetProgress >= 100 ? '[&>div]:bg-primary' : targetProgress > 50 ? '[&>div]:bg-chart-2' : '[&>div]:bg-chart-3'}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loss Confirmation Dialog */}
      <AlertDialog open={!!lossConfirmPosition} onOpenChange={() => setLossConfirmPosition(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Close at Loss?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <span className="font-medium text-foreground">{lossConfirmPosition?.symbol}</span> is currently at a loss of{' '}
                <span className="font-medium text-destructive">${Math.abs(lossConfirmPosition?.pnl || 0).toFixed(2)}</span>.
              </p>
              <p className="text-sm">
                The bot is designed to only close positions at the profit target. 
                Closing now will realize this loss.
              </p>
              <p className="font-medium text-foreground mt-3">
                Are you sure you want to close this position at a loss?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>Wait for Profit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => lossConfirmPosition && executeClose(lossConfirmPosition.id)}
              disabled={isClosing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClosing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Close at Loss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
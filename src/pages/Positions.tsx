import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { X, TrendingUp, TrendingDown, AlertTriangle, Clock, Target, Loader2 } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
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

export default function PositionsPage() {
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
  const totalSize = positions.reduce((sum, p) => sum + p.order_size_usd, 0);

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

  // Calculate ETA to profit target
  const getETA = (position: typeof positions[0]) => {
    if (!position.opened_at) return null;
    const elapsedMs = Date.now() - new Date(position.opened_at).getTime();
    const elapsedSec = elapsedMs / 1000;
    
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

  // Calculate positions at loss for Close All warning
  const losingPositions = positions.filter(p => p.unrealized_pnl < 0);
  const totalLoss = losingPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Active Positions</h1>
            <p className="text-muted-foreground">Manage and monitor your open positions</p>
          </div>
          {positions.length > 0 && (
            <Button 
              variant="destructive" 
              onClick={closeAllPositions}
              className="gap-2"
            >
              <AlertTriangle className="h-4 w-4" />
              Close All Positions
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Open Positions</p>
              <p className="text-2xl font-bold text-foreground">{positions.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total Exposure</p>
              <p className="text-2xl font-bold text-foreground">${totalSize.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Unrealized P&L</p>
              <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Position Details</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No active positions</p>
                <p className="text-sm mt-1">Start the bot to begin trading</p>
              </div>
            ) : (
              <div className="space-y-4">
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
                      className="p-4 rounded-lg bg-secondary/50 border border-border"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <span className="text-3xl">{getExchangeLogo(position.exchange_id)}</span>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl font-bold text-foreground">{position.symbol}</span>
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
                              <Badge variant="outline">{position.trade_type}</Badge>
                              {position.leverage > 1 && (
                                <Badge variant="secondary">{position.leverage}x</Badge>
                              )}
                              {position.is_paper_trade && (
                                <Badge variant="secondary">📝 Paper</Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Exchange</p>
                                <p className="font-medium text-foreground">{getExchangeName(position.exchange_id)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Entry Price</p>
                                <p className="font-mono text-foreground">${position.entry_price.toFixed(4)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Current Price</p>
                                <p className="font-mono text-foreground font-medium">${currentPrice?.toFixed(4) || '-'}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Position Size</p>
                                <p className="font-mono text-foreground">${position.order_size_usd.toFixed(2)}</p>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Target className="h-3 w-3" />
                                  <span>Target: ${position.profit_target.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={targetProgress >= 100 ? 'text-primary font-medium' : ''}>
                                    Progress: {targetProgress.toFixed(0)}%
                                  </span>
                                  {eta && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      ETA: {eta}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Progress 
                                value={targetProgress} 
                                className={`h-2 ${targetProgress >= 100 ? '[&>div]:bg-primary' : targetProgress > 50 ? '[&>div]:bg-chart-2' : '[&>div]:bg-chart-3'}`}
                              />
                            </div>

                            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Opened {position.opened_at ? formatDistanceToNow(new Date(position.opened_at)) : '-'} ago
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`text-2xl font-bold font-mono ${position.unrealized_pnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
                              {position.unrealized_pnl >= 0 ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                            </p>
                            <p className={`text-sm ${pnlPercent >= 0 ? 'text-primary' : 'text-destructive'}`}>
                              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                            </p>
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
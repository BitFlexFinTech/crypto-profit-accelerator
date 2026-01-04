import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, AlertTriangle, Loader2 } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { toast } from 'sonner';
import { ProfitProgressIndicator } from './cards/ProfitProgressIndicator';

export function PositionsPanel() {
  const { positions, loading, closePosition, closeAllPositions, exchanges, prices } = useTrading();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
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

  // STRICT RULE: Cannot close at a loss - only profitable positions can be closed
  const handleClosePosition = async (positionId: string, pnl: number, profitTarget: number, symbol: string) => {
    // STRICT: Only allow closing if position is at or above profit target
    if (pnl < profitTarget) {
      toast.error(`Cannot close ${symbol} yet`, {
        description: `Position must reach profit target (+$${profitTarget.toFixed(2)}). Current: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        dismissible: true,
      });
      return;
    }
    
    await executeClose(positionId);
  };

  const executeClose = async (positionId: string) => {
    setClosingPositionId(positionId);
    setIsClosing(true);
    try {
      await closePosition(positionId);
      toast.success('Position Closed at Profit Target', { dismissible: true });
    } catch {
      toast.error('Failed to close position', { dismissible: true });
    } finally {
      setClosingPositionId(null);
      setIsClosing(false);
    }
  };

  // STRICT: Close All only closes profitable positions
  const handleCloseAll = async () => {
    const profitablePositions = positions.filter(p => p.unrealized_pnl >= p.profit_target);
    const unprofitableCount = positions.length - profitablePositions.length;
    
    if (profitablePositions.length === 0) {
      toast.error('No positions at profit target', {
        description: `${unprofitableCount} position(s) still waiting to reach target`,
        dismissible: true,
      });
      return;
    }
    
    try {
      await closeAllPositions();
      toast.success(`Closed ${profitablePositions.length} profitable position(s)`, {
        description: unprofitableCount > 0 ? `${unprofitableCount} still waiting for target` : undefined,
        dismissible: true,
      });
    } catch {
      toast.error('Failed to close positions', { dismissible: true });
    }
  };

  // ETA calculation moved to ProfitProgressIndicator component

  // Calculate required exit price for profit target with fee breakdown
  const getTargetPriceInfo = (position: typeof positions[0]) => {
    const feeRate = position.trade_type === 'spot' ? 0.001 : 0.0005;
    const entryFee = position.order_size_usd * feeRate;
    const exitFee = position.order_size_usd * feeRate;
    const fundingFee = position.trade_type === 'futures' ? position.order_size_usd * 0.0001 : 0;
    const totalFees = entryFee + exitFee + fundingFee;
    
    // Required gross profit to achieve target after fees
    const requiredGrossProfit = position.profit_target + totalFees;
    
    // Calculate target price based on direction
    const leverage = position.leverage || 1;
    const priceMovementNeeded = requiredGrossProfit / (position.quantity * leverage);
    
    let targetPrice: number;
    if (position.direction === 'long') {
      targetPrice = position.entry_price + priceMovementNeeded;
    } else {
      targetPrice = position.entry_price - priceMovementNeeded;
    }
    
    const priceChangePercent = (priceMovementNeeded / position.entry_price) * 100;
    
    return {
      targetPrice,
      priceMovement: priceMovementNeeded,
      priceChangePercent,
      entryFee,
      exitFee,
      fundingFee,
      totalFees,
    };
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
                const currentPrice = prices[position.symbol] || position.current_price;
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
                            {/* Take-profit order status */}
                            {position.take_profit_order_id && (
                              <Badge 
                                variant={
                                  position.take_profit_status === 'pending' ? 'outline' :
                                  position.take_profit_status === 'filled' ? 'default' : 'secondary'
                                }
                                className={`text-xs ${position.take_profit_status === 'pending' ? 'text-yellow-500 border-yellow-500/50' : ''}`}
                              >
                                TP: ${position.take_profit_price?.toFixed(2)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>{getExchangeName(position.exchange_id)}</span>
                            <span>Entry: ${position.entry_price.toFixed(4)}</span>
                            <span className="text-foreground font-medium">
                              Now: ${currentPrice?.toFixed(4) || '-'}
                            </span>
                            {position.leverage && position.leverage > 1 && <span>{position.leverage}x</span>}
                          </div>
                          {/* Profit Target Calculator with Fee Breakdown */}
                          {(() => {
                            const targetInfo = getTargetPriceInfo(position);
                            return (
                              <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
                                <span className="text-muted-foreground">
                                  Target: <span className="text-foreground font-medium">${targetInfo.targetPrice.toFixed(4)}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  Need: <span className={`font-medium ${position.direction === 'long' ? 'text-primary' : 'text-destructive'}`}>
                                    {position.direction === 'long' ? '+' : '-'}${Math.abs(targetInfo.priceMovement).toFixed(4)} ({targetInfo.priceChangePercent.toFixed(3)}%)
                                  </span>
                                </span>
                                <span className="text-muted-foreground">
                                  Fees: <span className="text-foreground">
                                    entry ${targetInfo.entryFee.toFixed(2)} | exit ${targetInfo.exitFee.toFixed(2)}{targetInfo.fundingFee > 0 && ` | funding ${targetInfo.fundingFee.toFixed(2)}`} (${targetInfo.totalFees.toFixed(2)})
                                  </span>
                                </span>
                              </div>
                            );
                          })()}
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
                        {/* STRICT: Only show close button if at profit target */}
                        {position.unrealized_pnl >= position.profit_target ? (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleClosePosition(position.id, position.unrealized_pnl, position.profit_target, position.symbol)}
                            disabled={isThisClosing}
                            className="gap-1 bg-primary hover:bg-primary/90"
                          >
                            {isThisClosing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <TrendingUp className="h-4 w-4" />
                            )}
                            Take Profit
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Waiting for target...
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Real-time Progress Indicator with Countdown */}
                    <div className="mt-2">
                      <ProfitProgressIndicator
                        currentPnl={position.unrealized_pnl}
                        profitTarget={position.profit_target}
                        openedAt={position.opened_at}
                        symbol={position.symbol}
                        isClosing={isThisClosing}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
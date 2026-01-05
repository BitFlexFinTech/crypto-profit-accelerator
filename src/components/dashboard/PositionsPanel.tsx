import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, AlertTriangle, Loader2, X, RefreshCcw, CheckCircle, AlertCircle, HelpCircle, ArrowRightLeft } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

type SortOption = 'pnl' | 'tpProgress' | 'symbol';

export function PositionsPanel() {
  const { 
    positions, 
    loading, 
    closePosition, 
    closeAllPositions, 
    forceClosePosition,
    exchanges, 
    prices, 
    reconcilePositions,
    verifyPositions,
    positionVerifications,
    isVerifying,
  } = useTrading();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [forceClosingId, setForceClosingId] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('pnl');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  // Calculate TP progress for a position
  const calculateTpProgress = useCallback((position: typeof positions[0], currentPrice: number | undefined) => {
    if (!position.take_profit_price || !currentPrice) return 0;
    
    const entryPrice = position.entry_price;
    const tpPrice = Number(position.take_profit_price);
    
    if (position.direction === 'long') {
      const totalDistance = tpPrice - entryPrice;
      const currentDistance = currentPrice - entryPrice;
      return totalDistance > 0 ? Math.min(100, Math.max(0, (currentDistance / totalDistance) * 100)) : 0;
    } else {
      const totalDistance = entryPrice - tpPrice;
      const currentDistance = entryPrice - currentPrice;
      return totalDistance > 0 ? Math.min(100, Math.max(0, (currentDistance / totalDistance) * 100)) : 0;
    }
  }, []);

  // Sorted positions based on selected sort option
  const sortedPositions = useMemo(() => {
    const sorted = [...positions];
    
    switch (sortBy) {
      case 'pnl':
        return sorted.sort((a, b) => b.unrealized_pnl - a.unrealized_pnl);
      case 'tpProgress':
        return sorted.sort((a, b) => {
          const aProgress = calculateTpProgress(a, prices[a.symbol] || a.current_price);
          const bProgress = calculateTpProgress(b, prices[b.symbol] || b.current_price);
          return bProgress - aProgress;
        });
      case 'symbol':
        return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
      default:
        return sorted;
    }
  }, [positions, sortBy, prices, calculateTpProgress]);

  // Auto-refresh positions from exchanges every 30 seconds
  useEffect(() => {
    if (!autoRefreshEnabled || positions.length === 0) return;
    
    const refreshInterval = setInterval(async () => {
      if (isAutoRefreshing || isReconciling || isVerifying) return;
      
      setIsAutoRefreshing(true);
      try {
        await verifyPositions(false);
        setLastRefresh(new Date());
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      } finally {
        setIsAutoRefreshing(false);
      }
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, [autoRefreshEnabled, positions.length, isAutoRefreshing, isReconciling, isVerifying, verifyPositions]);

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

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      const result = await reconcilePositions(false) as { summary?: { mismatched?: number; matched?: number; fixed?: number } };
      if (result?.summary?.mismatched && result.summary.mismatched > 0) {
        toast.warning(`Found ${result.summary.mismatched} mismatches`, {
          description: 'Click "Fix All" to auto-close ghost positions',
          action: {
            label: 'Fix All',
            onClick: async () => {
              const fixResult = await reconcilePositions(true) as { summary?: { fixed?: number } };
              if (fixResult?.summary?.fixed && fixResult.summary.fixed > 0) {
                toast.success(`Fixed ${fixResult.summary.fixed} positions`);
              }
            },
          },
          duration: 10000,
        });
      } else {
        toast.success('All positions synced', { 
          description: `${result?.summary?.matched || 0} positions verified`,
        });
      }
    } catch {
      toast.error('Reconcile failed');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleVerify = async () => {
    try {
      const result = await verifyPositions(false) as { 
        summary?: { verified?: number; missing?: number; mismatch?: number; total?: number } 
      };
      
      const summary = result?.summary;
      if (summary?.missing && summary.missing > 0) {
        toast.warning(`Found ${summary.missing} phantom position(s)`, {
          description: 'These positions no longer exist on the exchange',
          action: {
            label: 'Clean Up',
            onClick: async () => {
              const cleanResult = await verifyPositions(true) as { summary?: { cleaned?: number } };
              if (cleanResult?.summary?.cleaned && cleanResult.summary.cleaned > 0) {
                toast.success(`Cleaned ${cleanResult.summary.cleaned} phantom positions`);
              }
            },
          },
          duration: 10000,
        });
      } else if (summary?.mismatch && summary.mismatch > 0) {
        toast.warning(`Found ${summary.mismatch} quantity mismatch(es)`, {
          description: 'Position quantities differ from exchange',
        });
      } else {
        toast.success('All positions verified', {
          description: `${summary?.verified || 0} positions confirmed on exchanges`,
        });
      }
    } catch {
      toast.error('Verification failed');
    }
  };

  const getVerificationIcon = (positionId: string) => {
    const verification = positionVerifications[positionId];
    if (!verification) {
      return <HelpCircle className="h-2.5 w-2.5 text-muted-foreground" />;
    }
    
    switch (verification.status) {
      case 'VERIFIED':
        return <CheckCircle className="h-2.5 w-2.5 text-primary" />;
      case 'MISSING':
        return <AlertCircle className="h-2.5 w-2.5 text-destructive" />;
      case 'QUANTITY_MISMATCH':
        return <AlertTriangle className="h-2.5 w-2.5 text-yellow-500" />;
      default:
        return <HelpCircle className="h-2.5 w-2.5 text-muted-foreground" />;
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

  // Count verification statuses
  const verifiedCount = Object.values(positionVerifications).filter(v => v.status === 'VERIFIED').length;
  const missingCount = Object.values(positionVerifications).filter(v => v.status === 'MISSING').length;

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
            {verifiedCount > 0 && (
              <span className="text-primary ml-1">• {verifiedCount}✓</span>
            )}
            {missingCount > 0 && (
              <span className="text-destructive ml-1">• {missingCount}⚠</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Sort Options */}
          <div className="flex items-center gap-0.5 border border-border rounded px-0.5">
            <Button
              variant={sortBy === 'pnl' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSortBy('pnl')}
              className="h-4 px-1 text-[8px]"
              title="Sort by Profit/Loss"
            >
              P&L
            </Button>
            <Button
              variant={sortBy === 'tpProgress' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSortBy('tpProgress')}
              className="h-4 px-1 text-[8px]"
              title="Sort by TP Progress"
            >
              TP%
            </Button>
            <Button
              variant={sortBy === 'symbol' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSortBy('symbol')}
              className="h-4 px-1 text-[8px]"
              title="Sort Alphabetically"
            >
              A-Z
            </Button>
          </div>

          {/* Auto-Refresh Toggle */}
          <Button
            variant={autoRefreshEnabled ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={cn(
              "h-5 px-1 text-[9px] gap-0.5",
              autoRefreshEnabled && "border-primary/50"
            )}
            title={autoRefreshEnabled ? "Auto-refresh ON (30s)" : "Auto-refresh OFF"}
          >
            <RefreshCcw className={cn(
              "h-2.5 w-2.5",
              (autoRefreshEnabled && isAutoRefreshing) && "animate-spin"
            )} />
            {autoRefreshEnabled ? 'Auto' : 'Off'}
          </Button>
          {lastRefresh && (
            <span className="text-[8px] text-muted-foreground">
              {Math.floor((Date.now() - lastRefresh.getTime()) / 1000)}s
            </span>
          )}

          <Button 
            variant="outline" 
            size="sm"
            onClick={handleVerify}
            disabled={isVerifying}
            className="h-5 px-1.5 text-[10px] gap-0.5"
            title="Verify positions exist on exchanges"
          >
            {isVerifying ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <CheckCircle className="h-2.5 w-2.5" />
            )}
            Verify
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleReconcile}
            disabled={isReconciling}
            className="h-5 px-1.5 text-[10px] gap-0.5"
          >
            <RefreshCcw className={cn("h-2.5 w-2.5", isReconciling && "animate-spin")} />
            Sync
          </Button>
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
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
        {positions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-xs">No positions</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1 p-1.5">
              {sortedPositions.map((position) => {
                const pnlPercent = position.entry_price > 0 
                  ? ((position.unrealized_pnl / position.order_size_usd) * 100)
                  : 0;
                const currentPrice = prices[position.symbol] || position.current_price;
                const isClosing = closingPositionId === position.id;
                const canClose = position.unrealized_pnl >= position.profit_target;
                const progressPct = Math.min(100, Math.max(0, (position.unrealized_pnl / position.profit_target) * 100));
                const verification = positionVerifications[position.id];
                const isPhantom = verification?.status === 'MISSING';
                
                return (
                  <div 
                    key={position.id}
                    className={cn(
                      "p-1.5 rounded bg-secondary/50 border border-border/50",
                      isPhantom && "border-destructive/50 bg-destructive/10"
                    )}
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
                            {getVerificationIcon(position.id)}
                            <span className={cn(
                              "font-medium text-foreground text-xs truncate",
                              isPhantom && "text-destructive line-through"
                            )}>
                              {position.symbol}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-0.5 py-0">
                              {position.trade_type[0]}
                            </Badge>
                            {position.leverage && position.leverage > 1 && (
                              <span className="text-[8px] text-muted-foreground">{position.leverage}x</span>
                            )}
                            {isPhantom && (
                              <Badge variant="destructive" className="text-[8px] px-0.5 py-0">
                                PHANTOM
                              </Badge>
                            )}
                            {verification?.status === 'QUANTITY_MISMATCH' && verification.exchange_quantity !== undefined && (
                              <Badge variant="outline" className="text-[8px] px-0.5 py-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                Sync: {verification.exchange_quantity.toFixed(4)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                            <span title="Entry">${position.entry_price.toFixed(2)}</span>
                            <span>→</span>
                            <span className="text-foreground" title="Current">${currentPrice?.toFixed(2) || '-'}</span>
                            {position.take_profit_price && (
                              <>
                                <span>→</span>
                                <span className="text-primary font-medium" title="Take Profit Target">
                                  ${Number(position.take_profit_price).toFixed(2)}
                                </span>
                                {position.take_profit_status === 'pending' && (
                                  <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 bg-blue-500/10 text-blue-400 border-blue-500/30">
                                    TP
                                  </Badge>
                                )}
                                {position.take_profit_status === 'filled' && (
                                  <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 bg-primary/10 text-primary border-primary/30">
                                    FILLED
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {/* TP Progress Indicator */}
                          {position.take_profit_price && currentPrice && (() => {
                            const entryPrice = position.entry_price;
                            const tpPrice = Number(position.take_profit_price);
                            let tpProgress: number;
                            
                            if (position.direction === 'long') {
                              const totalDistance = tpPrice - entryPrice;
                              const currentDistance = currentPrice - entryPrice;
                              tpProgress = totalDistance > 0 ? Math.min(100, Math.max(0, (currentDistance / totalDistance) * 100)) : 0;
                            } else {
                              const totalDistance = entryPrice - tpPrice;
                              const currentDistance = entryPrice - currentPrice;
                              tpProgress = totalDistance > 0 ? Math.min(100, Math.max(0, (currentDistance / totalDistance) * 100)) : 0;
                            }
                            
                            return (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      tpProgress >= 80 ? "bg-primary" : 
                                      tpProgress >= 50 ? "bg-yellow-500" : 
                                      "bg-blue-500"
                                    )}
                                    style={{ width: `${Math.max(0, tpProgress)}%` }}
                                  />
                                </div>
                                <span className={cn(
                                  "text-[8px] font-mono",
                                  tpProgress >= 80 ? "text-primary" : 
                                  tpProgress >= 50 ? "text-yellow-500" : 
                                  "text-blue-400"
                                )}>
                                  {tpProgress.toFixed(0)}% to TP
                                </span>
                              </div>
                            );
                          })()}
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
                          {isPhantom ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={async () => {
                                setForceClosingId(position.id);
                                try {
                                  await forceClosePosition(position.id);
                                  toast.success('Phantom position removed');
                                } catch {
                                  toast.error('Failed to remove');
                                } finally {
                                  setForceClosingId(null);
                                }
                              }}
                              disabled={forceClosingId === position.id}
                              className="h-5 px-1.5 text-[10px] gap-0.5"
                            >
                              {forceClosingId === position.id ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <X className="h-2.5 w-2.5" />
                              )}
                              Remove
                            </Button>
                          ) : (
                            <>
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
                              {/* Show stuck/error TP status badge */}
                              {(position.take_profit_status as string) === 'stuck' && (
                                <Badge variant="outline" className="text-[8px] px-0.5 py-0 bg-orange-500/10 text-orange-400 border-orange-500/30">
                                  STUCK
                                </Badge>
                              )}
                              {(position.take_profit_status as string) === 'error' && (
                                <Badge variant="outline" className="text-[8px] px-0.5 py-0 bg-red-500/10 text-red-400 border-red-500/30">
                                  TP ERR
                                </Badge>
                              )}
                              {verification?.status === 'QUANTITY_MISMATCH' && verification.exchange_quantity !== undefined && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await supabase
                                        .from('positions')
                                        .update({ quantity: verification.exchange_quantity, updated_at: new Date().toISOString() })
                                        .eq('id', position.id);
                                      toast.success(`Synced ${position.symbol} quantity to ${verification.exchange_quantity?.toFixed(4)}`);
                                      await verifyPositions();
                                    } catch {
                                      toast.error('Failed to sync quantity');
                                    }
                                  }}
                                  className="h-5 px-1 text-[9px] gap-0.5"
                                  title={`Update DB quantity to ${verification.exchange_quantity}`}
                                >
                                  <ArrowRightLeft className="h-2.5 w-2.5" />
                                  Sync
                                </Button>
                              )}
                              {!canClose && (
                                <span className="text-[8px] text-muted-foreground whitespace-nowrap">
                                  +${(position.profit_target - position.unrealized_pnl).toFixed(2)}
                                </span>
                              )}
                            </>
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

import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, AlertTriangle, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

export function BotControls() {
  const { settings, isEngineRunning, startBot, stopBot, closeAllPositions, positions, appendExecutionLog } = useTrading();
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForceRunning, setIsForceRunning] = useState(false);

  if (!settings) return null;

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startBot();
      toast.success('Bot Started', {
        description: 'Trading engine is now active and scanning markets',
        dismissible: true,
      });
    } catch (error) {
      toast.error('Failed to start bot', { dismissible: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stopBot();
      toast.success('Bot Paused', {
        description: 'Trading engine paused. Positions remain open.',
        dismissible: true,
      });
    } catch (error) {
      toast.error('Failed to stop bot', { dismissible: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceRun = async () => {
    setIsForceRunning(true);
    try {
      appendExecutionLog({
        type: 'INFO',
        message: 'Force Run triggered manually',
      });
      
      const { data, error } = await supabase.functions.invoke('run-trading-loop');
      
      if (error) {
        toast.error('Force Run Failed', {
          description: error.message,
          dismissible: true,
        });
        appendExecutionLog({
          type: 'ERROR',
          message: `Force Run error: ${error.message}`,
        });
        return;
      }

      const result = data;
      
      if (result?.status === 'skipped') {
        toast.info('Bot Not Running', {
          description: 'Start the bot first to execute trades',
          dismissible: true,
        });
      } else if (result?.tradesExecuted > 0) {
        toast.success('Force Run Complete', {
          description: `Executed ${result.tradesExecuted} trade(s)`,
          dismissible: true,
        });
      } else {
        toast.success('Force Run Complete', {
          description: result?.message || 'Analysis complete, no trades triggered',
          dismissible: true,
        });
      }

      // Log any errors from the loop
      if (result?.errors?.length > 0) {
        result.errors.forEach((err: { symbol?: string; message?: string; suggestion?: string; errorType?: string }) => {
          appendExecutionLog({
            type: err.errorType === 'API_PERMISSION_ERROR' ? 'API_PERMISSION_ERROR' : 'ERROR',
            message: `${err.symbol || 'Trade'}: ${err.message}`,
            suggestion: err.suggestion,
          });
        });
      }
    } catch (error) {
      toast.error('Force Run Failed', { dismissible: true });
    } finally {
      setIsForceRunning(false);
    }
  };

  const handleKillSwitch = async () => {
    setIsLoading(true);
    try {
      if (isEngineRunning) {
        await stopBot();
      }
      if (positions.length > 0) {
        await closeAllPositions();
      }
      toast.success('Kill Switch Activated', {
        description: `Bot stopped and ${positions.length} position(s) closed`,
        dismissible: true,
      });
    } catch (error) {
      toast.error('Kill switch error', { dismissible: true });
    } finally {
      setIsLoading(false);
      setKillDialogOpen(false);
    }
  };

  // Calculate loss statistics for kill switch warning
  const profitablePositions = positions.filter(p => p.unrealized_pnl >= 0);
  const losingPositions = positions.filter(p => p.unrealized_pnl < 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  const totalLoss = losingPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

  return (
    <>
      <div className="flex items-center gap-3">
        <Badge 
          variant={isEngineRunning ? 'default' : 'secondary'}
          className={isEngineRunning ? 'bg-primary text-primary-foreground animate-pulse' : ''}
        >
          {isEngineRunning ? '🟢 Running' : '⚪ Stopped'}
        </Badge>

        <Button
          variant={isEngineRunning ? 'outline' : 'default'}
          size="sm"
          onClick={isEngineRunning ? handleStop : handleStart}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEngineRunning ? (
            <>
              <Square className="h-4 w-4" />
              Stop Bot
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start Bot
            </>
          )}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleForceRun}
          disabled={isForceRunning || isLoading}
          className="gap-2"
        >
          {isForceRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Force Run
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setKillDialogOpen(true)}
          disabled={isLoading}
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          Kill Switch
        </Button>
      </div>

      {/* Kill Switch Confirmation Dialog */}
      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Emergency Kill Switch
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>This will immediately:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Stop the trading bot</li>
                <li>Close all {positions.length} open position{positions.length !== 1 ? 's' : ''}</li>
              </ul>
              
              {positions.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Profitable positions:</span>
                    <span className="text-primary font-medium">{profitablePositions.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Losing positions:</span>
                    <span className="text-destructive font-medium">{losingPositions.length}</span>
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Total unrealized P&L:</span>
                    <span className={totalUnrealizedPnl >= 0 ? 'text-primary' : 'text-destructive'}>
                      {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
                    </span>
                  </div>
                  {losingPositions.length > 0 && (
                    <p className="text-xs text-destructive mt-2">
                      ⚠️ Closing now will realize ${Math.abs(totalLoss).toFixed(2)} in losses from {losingPositions.length} position{losingPositions.length !== 1 ? 's' : ''}.
                    </p>
                  )}
                </div>
              )}

              <p className="font-medium text-foreground mt-3">
                Are you sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKillSwitch}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Confirm Kill Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
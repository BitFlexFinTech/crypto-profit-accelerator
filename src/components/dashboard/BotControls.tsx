import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, AlertTriangle, Loader2 } from 'lucide-react';
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

export function BotControls() {
  const { settings, isEngineRunning, startBot, stopBot, closeAllPositions, positions } = useTrading();
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
            <AlertDialogDescription className="space-y-2">
              <p>This will immediately:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Stop the trading bot</li>
                <li>Close all {positions.length} open position{positions.length !== 1 ? 's' : ''}</li>
              </ul>
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

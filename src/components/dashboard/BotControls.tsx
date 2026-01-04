import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Square, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function BotControls() {
  const { settings, isEngineRunning, startBot, stopBot, closeAllPositions, positions } = useTrading();

  if (!settings) return null;

  const handleStart = async () => {
    try {
      await startBot();
      toast.success('Bot Started', {
        description: 'Trading engine is now active',
        dismissible: true,
      });
    } catch (error) {
      toast.error('Failed to start bot', { dismissible: true });
    }
  };

  const handleStop = async () => {
    try {
      await stopBot();
      toast.success('Bot Stopped', {
        description: 'Trading engine has been paused',
        dismissible: true,
      });
    } catch (error) {
      toast.error('Failed to stop bot', { dismissible: true });
    }
  };

  const handleKillSwitch = async () => {
    try {
      if (isEngineRunning) {
        await stopBot();
      }
      if (positions.length > 0) {
        await closeAllPositions();
      }
      toast.success('Kill Switch Activated', {
        description: 'Bot stopped and all positions closed',
        dismissible: true,
      });
    } catch (error) {
      toast.error('Kill switch error', { dismissible: true });
    }
  };

  return (
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
        className="gap-2"
      >
        {isEngineRunning ? (
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
        onClick={handleKillSwitch}
        className="gap-2"
      >
        <AlertTriangle className="h-4 w-4" />
        Kill Switch
      </Button>
    </div>
  );
}

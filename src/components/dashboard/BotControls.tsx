import { useBotSettings } from '@/hooks/useBotSettings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, AlertTriangle } from 'lucide-react';
import { usePositions } from '@/hooks/usePositions';

export function BotControls() {
  const { settings, toggleBotRunning, togglePaperTrading } = useBotSettings();
  const { closeAllPositions, positions } = usePositions();

  if (!settings) return null;

  const handleKillSwitch = async () => {
    if (settings.is_bot_running) {
      await toggleBotRunning();
    }
    if (positions.length > 0) {
      await closeAllPositions();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Badge 
        variant={settings.is_paper_trading ? 'secondary' : 'default'}
        className={`cursor-pointer ${!settings.is_paper_trading ? 'bg-primary text-primary-foreground' : ''}`}
        onClick={togglePaperTrading}
      >
        {settings.is_paper_trading ? '📝 Paper' : '💰 Live'}
      </Badge>

      <Badge 
        variant={settings.is_bot_running ? 'default' : 'secondary'}
        className={settings.is_bot_running ? 'bg-primary text-primary-foreground animate-pulse-slow' : ''}
      >
        {settings.is_bot_running ? '🟢 Running' : '⚪ Stopped'}
      </Badge>

      <Button
        variant={settings.is_bot_running ? 'outline' : 'default'}
        size="sm"
        onClick={toggleBotRunning}
        className="gap-2"
      >
        {settings.is_bot_running ? (
          <>
            <Pause className="h-4 w-4" />
            Pause Bot
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

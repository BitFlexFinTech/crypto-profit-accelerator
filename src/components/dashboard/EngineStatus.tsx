import { useTradingEngine } from '@/hooks/useTradingEngine';
import { Badge } from '@/components/ui/badge';
import { Activity, Brain, Loader2, AlertCircle } from 'lucide-react';

export function EngineStatus() {
  const { engineState } = useTradingEngine();

  const getStatusConfig = () => {
    switch (engineState.status) {
      case 'analyzing':
        return {
          icon: <Brain className="h-3 w-3 animate-pulse" />,
          text: 'Analyzing',
          className: 'bg-blue-500/20 text-blue-400',
        };
      case 'trading':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Executing',
          className: 'bg-yellow-500/20 text-yellow-400',
        };
      case 'monitoring':
        return {
          icon: <Activity className="h-3 w-3" />,
          text: 'Monitoring',
          className: 'bg-primary/20 text-primary',
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
          className: 'bg-destructive/20 text-destructive',
        };
      default:
        return {
          icon: null,
          text: 'Idle',
          className: 'bg-secondary text-muted-foreground',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Badge className={config.className}>
      {config.icon}
      <span className="ml-1">{config.text}</span>
    </Badge>
  );
}

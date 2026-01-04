import { useTrading } from '@/contexts/TradingContext';
import { Badge } from '@/components/ui/badge';
import { Activity, Brain, Loader2, AlertCircle, Zap, Search } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function EngineStatus() {
  const { engineStatus, isEngineRunning, engineMetrics, signals } = useTrading();

  const getStatusConfig = () => {
    switch (engineStatus) {
      case 'analyzing':
        return {
          icon: <Brain className="h-3 w-3 animate-pulse" />,
          text: 'Analyzing',
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          detail: 'AI analyzing market data',
        };
      case 'scanning':
        return {
          icon: <Search className="h-3 w-3 animate-pulse" />,
          text: 'Scanning',
          className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
          detail: 'Scanning for opportunities',
        };
      case 'trading':
        return {
          icon: <Zap className="h-3 w-3 animate-bounce" />,
          text: 'Executing',
          className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          detail: 'Executing trade order',
        };
      case 'monitoring':
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'Monitoring',
          className: 'bg-primary/20 text-primary border-primary/30',
          detail: `${signals.length} signals | Loop: 3s`,
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
          className: 'bg-destructive/20 text-destructive border-destructive/30',
          detail: 'Check console for details',
        };
      default:
        return {
          icon: isEngineRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : null,
          text: isEngineRunning ? 'Starting...' : 'Idle',
          className: 'bg-secondary text-muted-foreground border-muted',
          detail: isEngineRunning ? 'Initializing engine' : 'Bot not running',
        };
    }
  };

  const config = getStatusConfig();
  const lastScan = engineMetrics.lastScanTime 
    ? `Last scan: ${Math.round((Date.now() - engineMetrics.lastScanTime.getTime()) / 1000)}s ago`
    : 'No scan yet';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`${config.className} border cursor-help`}>
          {config.icon}
          <span className="ml-1">{config.text}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-xs">
          <p className="font-medium">{config.detail}</p>
          <p className="text-muted-foreground">{lastScan}</p>
          {engineMetrics.cycleTime > 0 && (
            <p className="text-muted-foreground">Cycle time: {engineMetrics.cycleTime}ms</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

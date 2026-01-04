import { useTrading } from '@/contexts/TradingContext';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ConnectionStatus() {
  const { connectionStates, exchanges } = useTrading();
  
  const connectedExchanges = exchanges.filter(e => e.is_connected);
  
  // Count by status
  const statusCounts = Object.values(connectionStates).reduce(
    (acc, state) => {
      acc[state.status] = (acc[state.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const connected = statusCounts['connected'] || 0;
  const connecting = statusCounts['connecting'] || 0;
  const hasErrors = (statusCounts['error'] || 0) > 0;

  if (connectedExchanges.length === 0) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <WifiOff className="h-3 w-3 mr-1" />
        No exchanges
      </Badge>
    );
  }

  // Detailed status for tooltip
  const exchangeStatuses = Object.entries(connectionStates).map(([name, state]) => ({
    name,
    status: state.status,
    latency: state.latency,
    lastPing: state.lastPing,
  }));

  const getStatusIcon = () => {
    if (connected > 0) return <Wifi className="h-3 w-3 mr-1 animate-pulse" />;
    if (connecting > 0) return <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
    if (hasErrors) return <AlertCircle className="h-3 w-3 mr-1" />;
    return <WifiOff className="h-3 w-3 mr-1" />;
  };

  const getStatusText = () => {
    if (connected > 0) return `${connected} live`;
    if (connecting > 0) return `Connecting...`;
    if (hasErrors) return `Connection error`;
    return `Disconnected`;
  };

  const getVariant = () => {
    if (connected > 0) return 'default';
    if (hasErrors) return 'destructive';
    return 'secondary';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getVariant()}
            className={connected > 0 ? 'bg-primary text-primary-foreground cursor-help' : 'cursor-help'}
          >
            {getStatusIcon()}
            {getStatusText()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-xs">Exchange Connections</p>
            {exchangeStatuses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active connections</p>
            ) : (
              exchangeStatuses.map(({ name, status }) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${
                    status === 'connected' ? 'bg-primary' :
                    status === 'connecting' ? 'bg-warning animate-pulse' :
                    status === 'error' ? 'bg-destructive' : 'bg-muted'
                  }`} />
                  <span className="capitalize">{name}</span>
                  <span className="text-muted-foreground">
                    {status === 'connected' ? '✓' : status}
                  </span>
                </div>
              ))
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

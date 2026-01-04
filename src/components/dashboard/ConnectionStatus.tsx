import { useTrading } from '@/contexts/TradingContext';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, AlertCircle, Loader2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const { connectionStates, exchanges } = useTrading();
  
  const connectedExchanges = exchanges.filter(e => e.is_connected);
  const connectionEntries = Object.entries(connectionStates);
  
  const connectedCount = connectionEntries.filter(([, s]) => s.connected || s.status === 'connected').length;
  const connectingCount = connectionEntries.filter(([, s]) => s.status === 'connecting').length;
  const errorCount = connectionEntries.filter(([, s]) => s.status === 'error').length;
  const usingRestFallback = connectionEntries.some(([, s]) => s.usingRestFallback);
  
  const getOverallStatus = () => {
    if (connectedCount > 0) return 'connected';
    if (connectingCount > 0) return 'connecting';
    if (errorCount > 0) return 'error';
    return 'disconnected';
  };
  
  const status = getOverallStatus();
  
  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return usingRestFallback ? <Globe className="h-3 w-3" /> : <Wifi className="h-3 w-3" />;
      case 'connecting':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return <WifiOff className="h-3 w-3" />;
    }
  };
  
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-primary text-primary-foreground';
      case 'connecting':
        return 'bg-yellow-500/20 text-yellow-500';
      case 'error':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };
  
  const getStatusText = () => {
    if (connectedCount > 0) {
      if (usingRestFallback) {
        return `REST API`;
      }
      return `${connectedCount} Live`;
    }
    if (connectingCount > 0) return 'Connecting...';
    if (errorCount > 0) return 'Error';
    return 'Disconnected';
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="secondary" 
            className={cn("gap-1.5 cursor-help", getStatusColor())}
          >
            {getStatusIcon()}
            {getStatusText()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium text-sm">Data Connection Status</p>
            
            {connectionEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active connections</p>
            ) : (
              <div className="space-y-1">
                {connectionEntries.map(([name, state]) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        state.status === 'connected' ? 'bg-primary' :
                        state.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                        state.status === 'error' ? 'bg-destructive' : 'bg-muted'
                      )} />
                      <span className="text-muted-foreground">
                        {state.usingRestFallback ? 'REST API' : 
                         state.status === 'connected' ? 'WebSocket' : 
                         state.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {usingRestFallback && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                Using REST API fallback (updates every 5s)
              </p>
            )}
            
            {connectedExchanges.length > 0 && (
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium mb-1">Connected Exchanges:</p>
                <div className="flex flex-wrap gap-1">
                  {connectedExchanges.map(e => (
                    <Badge key={e.id} variant="outline" className="text-xs capitalize">
                      {e.exchange}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

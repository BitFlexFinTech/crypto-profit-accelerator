import { useTrading } from '@/contexts/TradingContext';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const { connectionStates, exchanges } = useTrading();
  
  const connectedExchanges = exchanges.filter(e => e.is_connected);
  const activeConnections = Object.values(connectionStates).filter(s => s.connected).length;

  if (connectedExchanges.length === 0) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <WifiOff className="h-3 w-3 mr-1" />
        No exchanges
      </Badge>
    );
  }

  return (
    <Badge 
      variant={activeConnections > 0 ? 'default' : 'secondary'}
      className={activeConnections > 0 ? 'bg-primary text-primary-foreground' : ''}
    >
      {activeConnections > 0 ? (
        <>
          <Wifi className="h-3 w-3 mr-1 animate-pulse" />
          {activeConnections}/{connectedExchanges.length} live
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3 mr-1" />
          Connecting...
        </>
      )}
    </Badge>
  );
}

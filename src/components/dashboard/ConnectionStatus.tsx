import { useWebSocketPrices } from '@/hooks/useWebSocketPrices';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const { connectionStates } = useWebSocketPrices();
  
  const connectedCount = Object.values(connectionStates).filter(s => s.connected).length;
  const totalCount = Object.keys(connectionStates).length;

  if (totalCount === 0) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <WifiOff className="h-3 w-3 mr-1" />
        No price feeds
      </Badge>
    );
  }

  return (
    <Badge 
      variant={connectedCount > 0 ? 'default' : 'secondary'}
      className={connectedCount > 0 ? 'bg-primary text-primary-foreground' : ''}
    >
      {connectedCount > 0 ? (
        <>
          <Wifi className="h-3 w-3 mr-1 animate-pulse" />
          {connectedCount}/{totalCount} feeds live
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

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Activity, Clock, Zap } from 'lucide-react';
import { wsManager, ConnectionState } from '@/services/ExchangeWebSocketManager';

type ExchangeName = 'binance' | 'okx' | 'bybit';

const EXCHANGE_DISPLAY: Record<ExchangeName, { name: string; color: string }> = {
  binance: { name: 'Binance', color: 'bg-yellow-500' },
  okx: { name: 'OKX', color: 'bg-blue-500' },
  bybit: { name: 'Bybit', color: 'bg-orange-500' },
};

export function WebSocketStatusPanel() {
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({});
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    // Poll connection status every 500ms
    const interval = setInterval(() => {
      const states = wsManager.getConnectionStatus();
      setConnectionStates(states);
      setLastUpdate(new Date());
    }, 500);

    // Track messages per second
    let messageCount = 0;
    const unsubscribe = wsManager.onPriceUpdate(() => {
      messageCount++;
    });

    const mpsInterval = setInterval(() => {
      setMessagesPerSecond(messageCount);
      messageCount = 0;
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(mpsInterval);
      unsubscribe();
    };
  }, []);

  const connectedCount = Object.values(connectionStates).filter(s => s.connected).length;
  const totalExchanges = Object.keys(EXCHANGE_DISPLAY).length;
  const avgLatency = wsManager.getAverageLatency();

  const getStatusBadge = (state: ConnectionState | undefined) => {
    if (!state) {
      return <Badge variant="outline" className="text-muted-foreground">Unknown</Badge>;
    }
    
    switch (state.status) {
      case 'connected':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Connected</Badge>;
      case 'connecting':
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">Connecting...</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Disconnected</Badge>;
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          WebSocket Connections
          <Badge variant="outline" className="ml-auto">
            {connectedCount}/{totalExchanges} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-lg font-bold text-primary">{avgLatency}ms</div>
            <div className="text-xs text-muted-foreground">Avg Latency</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-lg font-bold text-foreground">{messagesPerSecond}/s</div>
            <div className="text-xs text-muted-foreground">Messages</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-lg font-bold text-foreground">
              {wsManager.isAnyConnected() ? (
                <span className="text-primary">Live</span>
              ) : (
                <span className="text-muted-foreground">REST</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">Mode</div>
          </div>
        </div>

        {/* Per-Exchange Status */}
        <div className="space-y-2">
          {(Object.keys(EXCHANGE_DISPLAY) as ExchangeName[]).map(exchange => {
            const state = connectionStates[exchange];
            const config = EXCHANGE_DISPLAY[exchange];
            
            return (
              <div 
                key={exchange}
                className="flex items-center justify-between p-2 rounded bg-secondary/30 border border-border"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${state?.connected ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
                  <span className="text-sm font-medium">{config.name}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {state?.connected && state.latency > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {state.latency}ms
                    </span>
                  )}
                  {state?.reconnectAttempts > 0 && !state.connected && (
                    <span className="text-xs text-yellow-500">
                      Retry {state.reconnectAttempts}
                    </span>
                  )}
                  {getStatusBadge(state)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Last Update */}
        <div className="text-xs text-muted-foreground flex items-center gap-1 justify-center pt-1">
          <Clock className="h-3 w-3" />
          Last check: {lastUpdate.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { wsManager } from '@/services/ExchangeWebSocketManager';

export function GlobalSyncButton() {
  const { syncBalances, exchanges, engineMetrics } = useTrading();
  const [syncing, setSyncing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const navigate = useNavigate();

  // Memoize connected exchanges to prevent infinite re-renders
  const connectedExchanges = useMemo(
    () => exchanges.filter(e => e.is_connected),
    [exchanges]
  );
  const hasExchanges = connectedExchanges.length > 0;

  // Update "seconds ago" based on engineMetrics.lastScanTime for real-time display
  useEffect(() => {
    const interval = setInterval(() => {
      if (engineMetrics.lastScanTime) {
        const elapsed = Math.floor((Date.now() - engineMetrics.lastScanTime.getTime()) / 1000);
        setSecondsAgo(elapsed);
      }
      
      // Check if WebSocket is connected
      setIsLive(wsManager.isAnyConnected());
    }, 1000);
    return () => clearInterval(interval);
  }, [engineMetrics.lastScanTime]);

  const handleSync = async () => {
    if (!hasExchanges) {
      toast.error('No exchanges connected', {
        description: 'Please connect an exchange first',
      });
      return;
    }

    setSyncing(true);
    try {
      await syncBalances();
      toast.success('Balances synced', {
        description: `Synced ${connectedExchanges.length} exchange(s)`,
      });
    } catch (error) {
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!hasExchanges) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/settings')}
        className="gap-2"
      >
        <Settings className="h-4 w-4" />
        Connect Exchanges
      </Button>
    );
  }

  const getSyncStatus = () => {
    if (isLive || secondsAgo < 3) {
      return { text: 'Live', icon: Wifi, className: 'text-primary' };
    }
    if (secondsAgo < 10) {
      return { text: `${secondsAgo}s ago`, icon: Wifi, className: 'text-primary' };
    }
    if (secondsAgo < 60) {
      return { text: `${secondsAgo}s ago`, icon: Wifi, className: 'text-yellow-500' };
    }
    const mins = Math.floor(secondsAgo / 60);
    return { text: `${mins}m ago`, icon: WifiOff, className: 'text-muted-foreground' };
  };

  const syncStatus = getSyncStatus();
  const StatusIcon = syncStatus.icon;

  return (
    <div className="flex items-center gap-3">
      <div className={`flex items-center gap-1 text-xs ${syncStatus.className}`}>
        <StatusIcon className="h-3 w-3" />
        <span>{syncStatus.text}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync'}
      </Button>
    </div>
  );
}
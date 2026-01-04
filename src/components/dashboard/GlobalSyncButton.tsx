import { useState, useEffect } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export function GlobalSyncButton() {
  const { syncBalances, exchanges } = useTrading();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const navigate = useNavigate();

  const connectedExchanges = exchanges.filter(e => e.is_connected);
  const hasExchanges = connectedExchanges.length > 0;

  // Get the most recent sync time from exchanges
  useEffect(() => {
    if (connectedExchanges.length > 0) {
      const syncTimes = connectedExchanges
        .map(e => e.last_balance_sync ? new Date(e.last_balance_sync) : null)
        .filter((d): d is Date => d !== null);
      
      if (syncTimes.length > 0) {
        const mostRecent = new Date(Math.max(...syncTimes.map(d => d.getTime())));
        setLastSync(mostRecent);
      }
    }
  }, [connectedExchanges]);

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
      setLastSync(new Date());
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

  return (
    <div className="flex items-center gap-3">
      {lastSync && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Synced {formatDistanceToNow(lastSync, { addSuffix: true })}</span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Data'}
      </Button>
    </div>
  );
}

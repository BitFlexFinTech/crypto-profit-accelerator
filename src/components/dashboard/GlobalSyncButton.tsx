import { useState } from 'react';
import { useTrading } from '@/contexts/TradingContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function GlobalSyncButton() {
  const { syncBalances, exchanges } = useTrading();
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const connectedExchanges = exchanges.filter(e => e.is_connected);
  const hasExchanges = connectedExchanges.length > 0;

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

  return (
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
  );
}

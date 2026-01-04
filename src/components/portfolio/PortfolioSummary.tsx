import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { Wallet, TrendingUp, TrendingDown, RefreshCw, Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PortfolioSummary() {
  const { balances, trades, exchanges, syncBalances, connectionStates } = useTrading();
  const [isSyncing, setIsSyncing] = useState(false);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [lastSyncAgo, setLastSyncAgo] = useState<string>('');

  // Calculate total balance from real exchange data
  const totalBalance = balances.reduce((sum, b) => sum + (b.total || 0), 0);
  const availableBalance = balances.reduce((sum, b) => sum + (b.available || 0), 0);
  const lockedBalance = balances.reduce((sum, b) => sum + (b.locked || 0), 0);
  
  // Calculate 24h change from trades
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = trades.filter(t => new Date(t.created_at || '') >= todayStart);
  const todayPnL = todayTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const pnlPercentage = totalBalance > 0 ? (todayPnL / totalBalance) * 100 : 0;

  // Animate balance counter
  useEffect(() => {
    const duration = 1000;
    const steps = 60;
    const stepValue = (totalBalance - displayBalance) / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        setDisplayBalance(totalBalance);
        clearInterval(interval);
      } else {
        setDisplayBalance(prev => prev + stepValue);
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [totalBalance]);

  // Update "last synced" timer every second
  useEffect(() => {
    const updateSyncAgo = () => {
      if (balances.length === 0) {
        setLastSyncAgo('Not synced');
        return;
      }
      const lastSyncTime = new Date(Math.max(...balances.map(b => new Date(b.updated_at || 0).getTime())));
      const diffSec = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      
      if (diffSec < 5) setLastSyncAgo('Just now');
      else if (diffSec < 60) setLastSyncAgo(`${diffSec}s ago`);
      else if (diffSec < 3600) setLastSyncAgo(`${Math.floor(diffSec / 60)}m ago`);
      else setLastSyncAgo(`${Math.floor(diffSec / 3600)}h ago`);
    };
    
    updateSyncAgo();
    const interval = setInterval(updateSyncAgo, 1000);
    return () => clearInterval(interval);
  }, [balances]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncBalances();
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const connectedExchanges = exchanges.filter(e => e.is_connected).length;
  const hasKeys = exchanges.some(e => e.is_connected && e.api_key_encrypted);
  const lastSyncTime = balances.length > 0 
    ? new Date(Math.max(...balances.map(b => new Date(b.updated_at || 0).getTime())))
    : null;

  const stats = [
    {
      title: 'Total Portfolio Value',
      value: `$${displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: Wallet,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      subtitle: `${connectedExchanges} exchange${connectedExchanges !== 1 ? 's' : ''} connected`,
    },
    {
      title: 'Available Balance',
      value: `$${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      subtitle: 'Ready to trade',
    },
    {
      title: 'Locked in Positions',
      value: `$${lockedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      subtitle: 'In open positions',
    },
    {
      title: "Today's P&L",
      value: `${todayPnL >= 0 ? '+' : ''}$${todayPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: todayPnL >= 0 ? TrendingUp : TrendingDown,
      color: todayPnL >= 0 ? 'text-primary' : 'text-destructive',
      bgColor: todayPnL >= 0 ? 'bg-primary/10' : 'bg-destructive/10',
      subtitle: `${pnlPercentage >= 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Synced: {lastSyncAgo}</span>
          </div>
          {hasKeys && (
            <div className="flex items-center gap-1 text-primary">
              <Zap className="h-3 w-3" />
              <span className="text-xs">Auto-sync active</span>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className={cn("text-xl font-bold tabular-nums", stat.color)}>
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                </div>
                <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrading } from '@/contexts/TradingContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Holding {
  exchange: string;
  exchangeId: string;
  currency: string;
  total: number;
  available: number;
  locked: number;
  lastUpdated: Date;
}

export function HoldingsTable() {
  const { balances, exchanges, connectionStates } = useTrading();

  // Build holdings data from real balances
  const holdings: Holding[] = balances.map(balance => {
    const exchange = exchanges.find(e => e.id === balance.exchange_id);
    return {
      exchange: exchange?.exchange || 'Unknown',
      exchangeId: balance.exchange_id || '',
      currency: balance.currency || 'USDT',
      total: balance.total || 0,
      available: balance.available || 0,
      locked: balance.locked || 0,
      lastUpdated: new Date(balance.updated_at || 0),
    };
  }).filter(h => h.total > 0);

  // Sort by total value descending
  holdings.sort((a, b) => b.total - a.total);

  const getConnectionStatus = (exchangeName: string) => {
    const state = connectionStates[exchangeName];
    if (!state) return 'disconnected';
    return state.status;
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          Holdings by Exchange
        </CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No holdings found</p>
            <p className="text-sm">Connect an exchange and sync balances to see your holdings</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Locked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding, i) => {
                  const status = getConnectionStatus(holding.exchange);
                  const utilizationRate = holding.total > 0 ? (holding.locked / holding.total) * 100 : 0;
                  
                  return (
                    <TableRow 
                      key={`${holding.exchangeId}-${holding.currency}`}
                      className="animate-fade-in"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            status === 'connected' ? "bg-primary" : "bg-muted"
                          )} />
                          {holding.exchange.charAt(0).toUpperCase() + holding.exchange.slice(1)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{holding.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${holding.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-primary">
                        ${holding.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-warning">
                        ${holding.locked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {utilizationRate > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({utilizationRate.toFixed(0)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={status === 'connected' ? 'default' : 'secondary'}
                          className={cn(
                            status === 'connected' && "bg-primary/20 text-primary border-primary/30"
                          )}
                        >
                          {status === 'connected' ? 'Live' : 'Offline'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatTime(holding.lastUpdated)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useTrades } from '@/hooks/useTrades';
import { useExchanges } from '@/hooks/useExchanges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { EXCHANGE_CONFIGS } from '@/types/trading';

export default function HistoryPage() {
  const { trades, loading, getWinRate, getTotalProfit } = useTrades();
  const { exchanges } = useExchanges();

  const getExchangeName = (exchangeId?: string) => {
    if (!exchangeId) return 'Unknown';
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return 'Unknown';
    const config = EXCHANGE_CONFIGS.find(c => c.name === exchange.exchange);
    return config?.displayName || exchange.exchange;
  };

  const closedTrades = trades.filter(t => t.status === 'closed');
  const winRate = getWinRate();
  const totalProfit = getTotalProfit();
  const wins = closedTrades.filter(t => (t.net_profit || 0) > 0).length;
  const losses = closedTrades.filter(t => (t.net_profit || 0) <= 0).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Trade History</h1>
        <p className="text-muted-foreground">View your complete trading history and performance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold text-foreground">{closedTrades.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className={`text-2xl font-bold ${winRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
              {winRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Wins / Losses</p>
            <p className="text-2xl font-bold">
              <span className="text-primary">{wins}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-destructive">{losses}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Profit</p>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {closedTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No trade history yet</p>
              <p className="text-sm mt-1">Completed trades will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-muted-foreground">Exchange</TableHead>
                    <TableHead className="text-muted-foreground">Pair</TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Direction</TableHead>
                    <TableHead className="text-muted-foreground text-right">Size</TableHead>
                    <TableHead className="text-muted-foreground text-right">Entry</TableHead>
                    <TableHead className="text-muted-foreground text-right">Exit</TableHead>
                    <TableHead className="text-muted-foreground text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedTrades.map((trade) => (
                    <TableRow key={trade.id} className="border-border">
                      <TableCell className="text-foreground">
                        {trade.closed_at && format(new Date(trade.closed_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {getExchangeName(trade.exchange_id)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{trade.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {trade.trade_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={trade.direction === 'long' ? 'default' : 'destructive'}
                          className={`text-xs ${trade.direction === 'long' ? 'bg-primary text-primary-foreground' : ''}`}
                        >
                          {trade.direction === 'long' ? (
                            <><TrendingUp className="h-3 w-3 mr-1" />LONG</>
                          ) : (
                            <><TrendingDown className="h-3 w-3 mr-1" />SHORT</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-foreground">
                        ${trade.order_size_usd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        ${trade.entry_price.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        ${trade.exit_price?.toFixed(4) || '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-medium ${(trade.net_profit || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {(trade.net_profit || 0) >= 0 ? '+' : ''}${(trade.net_profit || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

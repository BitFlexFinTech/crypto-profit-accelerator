import { useTrades } from '@/hooks/useTrades';
import { useExchanges } from '@/hooks/useExchanges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex-shrink-0 h-12 border-b border-border px-4 flex items-center">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Fixed Header */}
      <div className="flex-shrink-0 h-12 border-b border-border px-4 flex items-center bg-card/50">
        <div>
          <h1 className="text-lg font-bold text-foreground">Trade History</h1>
          <p className="text-xs text-muted-foreground">Complete trading history and performance</p>
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Stats Cards */}
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">Total Trades</p>
                <p className="text-xl font-bold text-foreground">{closedTrades.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className={`text-xl font-bold ${winRate >= 50 ? 'text-primary' : 'text-destructive'}`}>
                  {winRate.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">Wins / Losses</p>
                <p className="text-xl font-bold">
                  <span className="text-primary">{wins}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">{losses}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-3 pb-2">
                <p className="text-xs text-muted-foreground">Total Profit</p>
                <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Trades Table */}
          <Card className="bg-card border-border">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm text-foreground">Recent Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {closedTrades.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No trade history yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-xs text-muted-foreground">Date</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Exchange</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Pair</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Type</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Dir</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-right">Size</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-right">Entry</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-right">Exit</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedTrades.map((trade) => (
                        <TableRow key={trade.id} className="border-border">
                          <TableCell className="text-xs text-foreground py-2">
                            {trade.closed_at && format(new Date(trade.closed_at), 'MMM dd, HH:mm')}
                          </TableCell>
                          <TableCell className="text-xs text-foreground py-2">
                            {getExchangeName(trade.exchange_id)}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-foreground py-2">{trade.symbol}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {trade.trade_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge 
                              variant={trade.direction === 'long' ? 'default' : 'destructive'}
                              className={`text-[10px] px-1 py-0 ${trade.direction === 'long' ? 'bg-primary text-primary-foreground' : ''}`}
                            >
                              {trade.direction === 'long' ? (
                                <TrendingUp className="h-2.5 w-2.5" />
                              ) : (
                                <TrendingDown className="h-2.5 w-2.5" />
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-foreground py-2">
                            ${trade.order_size_usd.toFixed(0)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                            ${trade.entry_price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground py-2">
                            ${trade.exit_price?.toFixed(2) || '-'}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-medium py-2 ${(trade.net_profit || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
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
      </ScrollArea>
    </div>
  );
}
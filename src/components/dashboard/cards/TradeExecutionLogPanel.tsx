import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useTrading } from '@/contexts/TradingContext';
import { FileText, Trash2, Copy, Filter, CheckCircle2, XCircle, Clock, Zap, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type LogType = 'all' | 'executions' | 'blocked' | 'errors';

export function TradeExecutionLogPanel() {
  const { executionLogs, clearExecutionLogs } = useTrading();
  const [filter, setFilter] = useState<LogType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = executionLogs.filter(log => {
    // Type filter
    if (filter === 'executions' && !['TRADE_SUCCESS', 'TRADE_REQUESTED'].includes(log.type)) return false;
    if (filter === 'blocked' && log.type !== 'BLOCKED') return false;
    if (filter === 'errors' && log.type !== 'TRADE_FAILED') return false;
    
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        log.symbol?.toLowerCase().includes(searchLower) ||
        log.message.toLowerCase().includes(searchLower) ||
        log.type.toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });

  const copyLogs = () => {
    const logText = filteredLogs
      .map(log => `[${log.timestamp.toISOString()}] ${log.type}: ${log.message}${log.symbol ? ` (${log.symbol})` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(logText);
    toast.success('Logs copied to clipboard');
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'TRADE_SUCCESS': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'TRADE_FAILED': return <XCircle className="h-3 w-3 text-red-500" />;
      case 'TRADE_REQUESTED': return <Zap className="h-3 w-3 text-blue-500" />;
      case 'BLOCKED': return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
      case 'LOOP_TICK': return <Clock className="h-3 w-3 text-muted-foreground" />;
      default: return <FileText className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'TRADE_SUCCESS': return 'bg-green-500/10 border-green-500/30';
      case 'TRADE_FAILED': return 'bg-red-500/10 border-red-500/30';
      case 'TRADE_REQUESTED': return 'bg-blue-500/10 border-blue-500/30';
      case 'BLOCKED': return 'bg-yellow-500/10 border-yellow-500/30';
      default: return 'bg-muted/30 border-muted';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Trade Execution Log
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {filteredLogs.length} entries
            </Badge>
            <Button variant="ghost" size="sm" onClick={copyLogs} className="h-7 px-2">
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={clearExecutionLogs} className="h-7 px-2 text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {(['all', 'executions', 'blocked', 'errors'] as LogType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(f)}
                className="h-6 px-2 text-xs capitalize"
              >
                {f}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Search symbol or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 text-xs max-w-[200px]"
          />
        </div>

        {/* Log List */}
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No log entries yet. Start the bot to see execution logs.
              </div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div
                  key={`${log.timestamp.getTime()}-${idx}`}
                  className={cn(
                    "p-2 rounded border text-xs flex items-start gap-2",
                    getLogColor(log.type)
                  )}
                >
                  <span className="flex-shrink-0 mt-0.5">{getLogIcon(log.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-muted-foreground">{formatTime(log.timestamp)}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {log.type}
                      </Badge>
                      {log.symbol && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 font-semibold">
                          {log.symbol}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-foreground break-words">{log.message}</p>
                    {log.details && (
                      <p className="mt-0.5 text-muted-foreground text-[10px] break-words">{log.details}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

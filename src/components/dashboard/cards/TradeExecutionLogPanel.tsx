import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useTrading } from '@/contexts/TradingContext';
import { FileText, Trash2, Copy, Filter, CheckCircle2, XCircle, Clock, Zap, AlertTriangle, ShieldAlert, Settings } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

type LogType = 'all' | 'executions' | 'blocked' | 'errors';

export function TradeExecutionLogPanel() {
  const { executionLogs, clearExecutionLogs } = useTrading();
  const [filter, setFilter] = useState<LogType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = executionLogs.filter(log => {
    // Type filter
    if (filter === 'executions' && !['TRADE_SUCCESS', 'TRADE_REQUESTED'].includes(log.type)) return false;
    if (filter === 'blocked' && log.type !== 'BLOCKED') return false;
    if (filter === 'errors' && !['TRADE_FAILED', 'API_PERMISSION_ERROR'].includes(log.type)) return false;
    
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

  // Count API permission errors for alert banner
  const permissionErrorCount = executionLogs.filter(
    log => log.type === 'API_PERMISSION_ERROR' || log.errorType === 'API_PERMISSION_ERROR'
  ).length;

  const copyLogs = () => {
    const logText = filteredLogs
      .map(log => `[${log.timestamp.toISOString()}] ${log.type}: ${log.message}${log.symbol ? ` (${log.symbol})` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(logText);
    toast.success('Logs copied to clipboard');
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'TRADE_SUCCESS': return <CheckCircle2 className="h-3 w-3 text-primary" />;
      case 'TRADE_FAILED': return <XCircle className="h-3 w-3 text-destructive" />;
      case 'API_PERMISSION_ERROR': return <ShieldAlert className="h-3 w-3 text-warning" />;
      case 'TRADE_REQUESTED': return <Zap className="h-3 w-3 text-accent" />;
      case 'BLOCKED': return <AlertTriangle className="h-3 w-3 text-warning" />;
      case 'LOOP_TICK': return <Clock className="h-3 w-3 text-muted-foreground" />;
      default: return <FileText className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getLogColor = (type: string, errorType?: string) => {
    if (type === 'API_PERMISSION_ERROR' || errorType === 'API_PERMISSION_ERROR') {
      return 'bg-warning/20 border-warning/50';
    }
    switch (type) {
      case 'TRADE_SUCCESS': return 'bg-primary/10 border-primary/30';
      case 'TRADE_FAILED': return 'bg-destructive/10 border-destructive/30';
      case 'TRADE_REQUESTED': return 'bg-accent/10 border-accent/30';
      case 'BLOCKED': return 'bg-warning/10 border-warning/30';
      default: return 'bg-muted/30 border-muted';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Card className="h-full flex flex-col bg-card border-0 border-l border-border rounded-none">
      <CardHeader className="py-2 px-3 flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Execution Log
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] h-5">
              {filteredLogs.length}
            </Badge>
            <Button variant="ghost" size="sm" onClick={copyLogs} className="h-6 w-6 p-0">
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={clearExecutionLogs} className="h-6 w-6 p-0 text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* API Permission Error Alert Banner */}
      {permissionErrorCount > 0 && (
        <div className="flex-shrink-0 px-2 py-2 bg-warning/20 border-b border-warning/30">
          <div className="flex items-center gap-2 text-xs text-warning">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">API Permission Error</span>
              <p className="text-[10px] text-warning/80 mt-0.5">
                Your API keys need trading permissions enabled.
              </p>
            </div>
            <Link to="/settings">
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-warning/50 text-warning hover:bg-warning/20">
                <Settings className="h-3 w-3" />
                Fix in Settings
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 px-2 py-1.5 border-b border-border space-y-1.5">
        {/* Filters */}
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {(['all', 'executions', 'blocked', 'errors'] as LogType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f)}
              className="h-5 px-1.5 text-[10px] capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-6 text-xs"
        />
      </div>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                No log entries yet
              </div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div
                  key={`${log.timestamp.getTime()}-${idx}`}
                  className={cn(
                    "p-1.5 rounded border text-[10px] flex items-start gap-1.5",
                    getLogColor(log.type, log.errorType)
                  )}
                >
                  <span className="flex-shrink-0 mt-0.5">{getLogIcon(log.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-muted-foreground">{formatTime(log.timestamp)}</span>
                      {log.symbol && (
                        <Badge variant="secondary" className="text-[9px] h-3.5 px-1 font-semibold">
                          {log.symbol}
                        </Badge>
                      )}
                      {log.errorType === 'API_PERMISSION_ERROR' && (
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-warning text-warning">
                          Permission Error
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-foreground break-words leading-tight">{log.message}</p>
                    {log.suggestion && (
                      <p className="mt-1 text-[9px] text-warning/80 italic flex items-center gap-1">
                        💡 {log.suggestion}
                      </p>
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
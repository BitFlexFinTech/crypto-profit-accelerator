import { useTrading } from '@/contexts/TradingContext';
import { Badge } from '@/components/ui/badge';
import { Activity, Brain, Loader2, AlertCircle, Zap, Search, Wifi, Clock, ShieldAlert, Database } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { wsManager } from '@/services/ExchangeWebSocketManager';
import { hftCore, HFTState } from '@/services/HFTCore';
import { useEffect, useState } from 'react';

export function EngineStatus() {
  const { engineStatus, isEngineRunning, engineMetrics, signals, positions, trades } = useTrading();
  const [wsLatency, setWsLatency] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [secondsUntilNextRun, setSecondsUntilNextRun] = useState(60);
  const [hftState, setHftState] = useState<HFTState | null>(null);

  // Track WebSocket connection status
  useEffect(() => {
    const checkWsStatus = () => {
      setWsLatency(wsManager.getAverageLatency());
      setWsConnected(wsManager.isAnyConnected());
    };
    
    checkWsStatus();
    const interval = setInterval(checkWsStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to HFT state changes
  useEffect(() => {
    const unsubscribe = hftCore.onStateChange((state) => {
      setHftState(state);
    });
    return unsubscribe;
  }, []);

  // Calculate countdown to next pg_cron execution (runs at :00 of each minute)
  useEffect(() => {
    const calculateNextRun = () => {
      const now = new Date();
      const secondsInCurrentMinute = now.getSeconds();
      return 60 - secondsInCurrentMinute;
    };
    
    setSecondsUntilNextRun(calculateNextRun());
    const interval = setInterval(() => {
      setSecondsUntilNextRun(calculateNextRun());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Calculate velocity metrics
  const recentTrades = trades.filter(t => {
    const closedAt = t.closed_at ? new Date(t.closed_at).getTime() : 0;
    return closedAt > Date.now() - 3600000; // Last hour
  });
  const tradesPerHour = recentTrades.length;
  
  // Calculate avg time to profit
  const avgTimeToProfit = recentTrades.length > 0
    ? recentTrades.reduce((acc, t) => {
        if (t.opened_at && t.closed_at) {
          const duration = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000;
          return acc + duration;
        }
        return acc;
      }, 0) / recentTrades.length
    : 0;
  
  const fastTradePercent = recentTrades.length > 0
    ? (recentTrades.filter(t => {
        if (t.opened_at && t.closed_at) {
          const duration = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 1000;
          return duration < 180; // Under 3 minutes
        }
        return false;
      }).length / recentTrades.length) * 100
    : 0;

  const getStatusConfig = () => {
    // Safe Mode takes priority
    if (hftState?.isSafeMode) {
      return {
        icon: <ShieldAlert className="h-3 w-3 animate-pulse" />,
        text: 'Safe Mode',
        className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        detail: hftState.safeModeReason || 'High latency detected',
      };
    }
    
    switch (engineStatus) {
      case 'analyzing':
        return {
          icon: <Brain className="h-3 w-3 animate-pulse" />,
          text: 'AI Analyzing',
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          detail: 'AI analyzing markets',
        };
      case 'scanning':
        return {
          icon: <Search className="h-3 w-3 animate-pulse" />,
          text: 'Scanning',
          className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
          detail: 'Finding opportunities',
        };
      case 'trading':
        return {
          icon: <Zap className="h-3 w-3 animate-bounce" />,
          text: 'Executing',
          className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          detail: 'Executing trade',
        };
      case 'monitoring':
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'High Velocity',
          className: 'bg-primary/20 text-primary border-primary/30',
          detail: `${signals.length} signals | ${positions.length} positions`,
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
          className: 'bg-destructive/20 text-destructive border-destructive/30',
          detail: 'Check console',
        };
      default:
        return {
          icon: isEngineRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : null,
          text: isEngineRunning ? 'Starting...' : 'Idle',
          className: 'bg-secondary text-muted-foreground border-muted',
          detail: isEngineRunning ? 'Initializing' : 'Bot not running',
        };
    }
  };

  const config = getStatusConfig();
  const lastScan = engineMetrics.lastScanTime 
    ? `${Math.round((Date.now() - engineMetrics.lastScanTime.getTime()) / 1000)}s ago`
    : 'Never';

  return (
    <div className="flex items-center gap-2">
      {/* Safe Mode Indicator */}
      {hftState?.isSafeMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 border animate-pulse cursor-help">
              <ShieldAlert className="h-3 w-3" />
              <span className="ml-1">SAFE</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="text-xs space-y-1">
              <p className="font-medium text-orange-400">Safe Mode Active</p>
              <p className="text-muted-foreground">{hftState.safeModeReason}</p>
              <p className="text-muted-foreground text-[10px]">New entries paused, exits allowed</p>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {/* DB Write Queue Indicator */}
      {hftState && hftState.dbWriteQueueSize > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border cursor-help">
              <Database className="h-3 w-3" />
              <span className="ml-1">{hftState.dbWriteQueueSize}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="text-xs space-y-1">
              <p className="font-medium">DB Write Queue</p>
              <p className="text-muted-foreground">{hftState.dbWriteQueueSize} pending writes</p>
              <p className="text-muted-foreground text-[10px]">Async persistence - trades execute first</p>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {/* WebSocket Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${wsConnected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'} border cursor-help`}>
            <Wifi className="h-3 w-3" />
            <span className="ml-1">{wsLatency > 0 ? `${wsLatency}ms` : 'WS'}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            <p className="font-medium">{wsConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}</p>
            {wsLatency > 0 && <p className="text-muted-foreground">Latency: {wsLatency}ms</p>}
            {wsLatency > 200 && <p className="text-orange-400">⚠️ High latency may trigger Safe Mode</p>}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Engine Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${config.className} border cursor-help`}>
            {config.icon}
            <span className="ml-1">{config.text}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            <p className="font-medium">{config.detail}</p>
            <p className="text-muted-foreground">Last scan: {lastScan}</p>
            {engineMetrics.cycleTime > 0 && (
              <p className="text-muted-foreground">Cycle: {engineMetrics.cycleTime}ms</p>
            )}
            <div className="border-t border-border pt-1 mt-1">
              <p className="text-muted-foreground">Trades/hr: {tradesPerHour}</p>
              {avgTimeToProfit > 0 && (
                <p className="text-muted-foreground">Avg time: {Math.round(avgTimeToProfit)}s</p>
              )}
              {fastTradePercent > 0 && (
                <p className={fastTradePercent >= 85 ? 'text-emerald-400' : 'text-yellow-400'}>
                  Fast trades: {fastTradePercent.toFixed(0)}%
                </p>
              )}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Cron Scheduler Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${isEngineRunning 
            ? (secondsUntilNextRun <= 10 
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse' 
              : 'bg-blue-500/20 text-blue-400 border-blue-500/30')
            : 'bg-secondary text-muted-foreground border-muted'} border cursor-help`}>
            <Clock className="h-3 w-3" />
            <span className="ml-1">{secondsUntilNextRun}s</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            <p className="font-medium">Auto-Trade Scheduler</p>
            <p>Next run in: {secondsUntilNextRun}s</p>
            <p className="text-muted-foreground">
              {isEngineRunning 
                ? 'Will analyze markets & execute trades' 
                : 'Bot stopped — will skip execution'}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

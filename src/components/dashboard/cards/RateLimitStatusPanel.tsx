import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { rateLimiter } from '@/services/RateLimiter';
import { Shield, AlertTriangle, Activity, Gauge, Clock, Ban, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

interface ExchangeStatus {
  used: number;
  limit: number;
  available: number;
  bucketTokens: number;
  bucketSize: number;
  isDangerous: boolean;
  apiWeight?: number;
  apiWeightLimit?: number;
  throttleLevel?: 'normal' | 'warning' | 'danger' | 'critical';
  throttleMultiplier?: number;
  queueDepth?: { p0: number; p1: number; p2: number; total: number };
  isCoolingDown?: boolean;
  cooldownRemaining?: number;
  cooldownReason?: string | null;
  clockOffset?: number;
  lastClockSync?: number;
  stats?: { requests: number; blocked: number; retries: number };
}

const EXCHANGE_DISPLAY: Record<ExchangeName, { name: string; color: string }> = {
  binance: { name: 'BN', color: 'text-yellow-500' },
  okx: { name: 'OKX', color: 'text-foreground' },
  bybit: { name: 'BB', color: 'text-orange-500' },
  kucoin: { name: 'KC', color: 'text-green-500' },
  hyperliquid: { name: 'HL', color: 'text-cyan-500' },
  nexo: { name: 'NX', color: 'text-blue-500' },
};

export function RateLimitStatusPanel() {
  const [statuses, setStatuses] = useState<Record<ExchangeName, ExchangeStatus>>({} as Record<ExchangeName, ExchangeStatus>);
  const [dangerCount, setDangerCount] = useState(0);
  const [cooldownCount, setCooldownCount] = useState(0);
  const [totalQueueDepth, setTotalQueueDepth] = useState(0);

  useEffect(() => {
    const update = () => {
      try {
        const allStatus = rateLimiter.getAllStatus();
        setStatuses(allStatus);
        const dangers = Object.values(allStatus).filter(s => s.isDangerous).length;
        const cooldowns = Object.values(allStatus).filter(s => s.isCoolingDown).length;
        const queueTotal = Object.values(allStatus).reduce((sum, s) => sum + (s.queueDepth?.total || 0), 0);
        setDangerCount(dangers);
        setCooldownCount(cooldowns);
        setTotalQueueDepth(queueTotal);
      } catch (error) {
        console.error('Failed to get rate limit status:', error);
      }
    };

    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, []);

  const getUsageColor = (usage: number) => {
    if (usage >= 80) return 'bg-destructive';
    if (usage >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusColor = (status: ExchangeStatus) => {
    if (status.isCoolingDown) return 'text-red-600';
    if (status.isDangerous) return 'text-destructive';
    const usage = ((status.bucketSize - status.bucketTokens) / status.bucketSize) * 100;
    if (usage >= 60) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = (status: ExchangeStatus) => {
    if (status.isCoolingDown) return '🚫';
    if (status.isDangerous) return '🔴';
    const usage = ((status.bucketSize - status.bucketTokens) / status.bucketSize) * 100;
    if (usage >= 60) return '🟠';
    return '🟢';
  };

  const formatTime = (ms: number): string => {
    if (ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatClockSync = (lastSync: number): string => {
    if (!lastSync) return 'never';
    const ago = Date.now() - lastSync;
    if (ago < 60000) return 'just now';
    if (ago < 3600000) return `${Math.floor(ago / 60000)}m ago`;
    return `${Math.floor(ago / 3600000)}h ago`;
  };

  const activeExchanges = (['binance', 'okx', 'bybit'] as ExchangeName[]);

  return (
    <TooltipProvider>
      <Card className="h-full bg-card/50 border-border">
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              Rate Limits
            </CardTitle>
            <div className="flex items-center gap-1">
              {cooldownCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5 animate-pulse">
                  <Ban className="h-3 w-3 mr-1" />
                  {cooldownCount} Banned
                </Badge>
              )}
              {cooldownCount === 0 && dangerCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5 animate-pulse">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {dangerCount} Danger
                </Badge>
              )}
              {cooldownCount === 0 && dangerCount === 0 && (
                <Badge variant="outline" className="text-[10px] h-5 text-green-500 border-green-500/30">
                  All Safe
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3 space-y-2">
          {activeExchanges.map((exchange) => {
            const status = statuses[exchange];
            if (!status) return null;

            const bucketUsage = ((status.bucketSize - status.bucketTokens) / status.bucketSize) * 100;
            const displayInfo = EXCHANGE_DISPLAY[exchange];
            const queueDepth = status.queueDepth || { p0: 0, p1: 0, p2: 0, total: 0 };

            return (
              <div key={exchange} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={cn("font-medium", displayInfo.color)}>
                    {displayInfo.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Bucket status */}
                    <span className="text-muted-foreground">
                      {status.bucketTokens}/{status.bucketSize}
                    </span>
                    
                    {/* API Weight if available */}
                    {status.apiWeight !== undefined && (
                      <span className="text-muted-foreground">
                        W:{status.apiWeight}/{status.apiWeightLimit}
                      </span>
                    )}
                    
                    {/* Queue depth indicator */}
                    {queueDepth.total > 0 && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="flex items-center gap-0.5 text-blue-400">
                            <Layers className="h-2.5 w-2.5" />
                            {queueDepth.total}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div>Queue: P0:{queueDepth.p0} P1:{queueDepth.p1} P2:{queueDepth.p2}</div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    
                    {/* Status indicator */}
                    <span className={cn("font-medium", getStatusColor(status))}>
                      {getStatusIcon(status)}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-1">
                  <Progress 
                    value={bucketUsage} 
                    className="h-1.5 flex-1"
                    indicatorClassName={status.isCoolingDown ? 'bg-red-600' : getUsageColor(bucketUsage)}
                  />
                </div>
                
                {/* Cooldown warning */}
                {status.isCoolingDown && status.cooldownRemaining && (
                  <div className="flex items-center gap-1 text-[9px] text-red-500 animate-pulse">
                    <Ban className="h-2.5 w-2.5" />
                    IP BANNED - {formatTime(status.cooldownRemaining)} remaining
                    {status.cooldownReason && (
                      <span className="text-red-400 ml-1">({status.cooldownReason})</span>
                    )}
                  </div>
                )}
                
                {/* Throttle warning */}
                {!status.isCoolingDown && status.isDangerous && (
                  <div className="flex items-center gap-1 text-[9px] text-destructive animate-pulse">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Rate limit critical
                    {status.throttleMultiplier !== undefined && status.throttleMultiplier < 1 && (
                      <span className="ml-1 flex items-center gap-0.5">
                        <Gauge className="h-2.5 w-2.5" />
                        Throttling: {Math.round((1 - status.throttleMultiplier) * 100)}% reduced
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary section */}
          <div className="pt-2 border-t border-border space-y-1">
            {/* Requests per minute */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Req/min
              </span>
              <div className="flex gap-2">
                {activeExchanges.map((ex) => {
                  const status = statuses[ex];
                  if (!status) return null;
                  return (
                    <span key={ex} className={cn("font-mono", EXCHANGE_DISPLAY[ex].color)}>
                      {status.used}/{status.limit}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Queue depth summary */}
            {totalQueueDepth > 0 && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Queue
                </span>
                <div className="flex gap-2">
                  {activeExchanges.map((ex) => {
                    const status = statuses[ex];
                    const qd = status?.queueDepth;
                    if (!qd || qd.total === 0) return null;
                    return (
                      <span key={ex} className="font-mono text-blue-400">
                        {EXCHANGE_DISPLAY[ex].name}:{qd.p0}/{qd.p1}/{qd.p2}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clock sync status */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Clock Sync
              </span>
              <div className="flex gap-2">
                {activeExchanges.map((ex) => {
                  const status = statuses[ex];
                  if (!status) return null;
                  const offset = status.clockOffset || 0;
                  const offsetColor = Math.abs(offset) < 100 ? 'text-green-500' : 
                                      Math.abs(offset) < 500 ? 'text-yellow-500' : 'text-red-500';
                  return (
                    <Tooltip key={ex}>
                      <TooltipTrigger>
                        <span className={cn("font-mono", offsetColor)}>
                          {offset > 0 ? '+' : ''}{offset}ms
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div>{EXCHANGE_DISPLAY[ex].name}: {formatClockSync(status.lastClockSync || 0)}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

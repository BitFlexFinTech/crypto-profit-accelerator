import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { rateLimiter } from '@/services/RateLimiter';
import { Shield, AlertTriangle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    const update = () => {
      try {
        const allStatus = rateLimiter.getAllStatus();
        setStatuses(allStatus);
        const dangers = Object.values(allStatus).filter(s => s.isDangerous).length;
        setDangerCount(dangers);
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
    if (status.isDangerous) return 'text-destructive';
    const usage = ((status.bucketSize - status.bucketTokens) / status.bucketSize) * 100;
    if (usage >= 60) return 'text-yellow-500';
    return 'text-green-500';
  };

  const activeExchanges = (['binance', 'okx', 'bybit'] as ExchangeName[]);

  return (
    <Card className="h-full bg-card/50 border-border">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Rate Limits
          </CardTitle>
          {dangerCount > 0 ? (
            <Badge variant="destructive" className="text-[10px] h-5 animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {dangerCount} Danger
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-5 text-green-500 border-green-500/30">
              All Safe
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-2">
        {activeExchanges.map((exchange) => {
          const status = statuses[exchange];
          if (!status) return null;

          const bucketUsage = ((status.bucketSize - status.bucketTokens) / status.bucketSize) * 100;
          const requestUsage = (status.used / status.limit) * 100;
          const displayInfo = EXCHANGE_DISPLAY[exchange];

          return (
            <div key={exchange} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className={cn("font-medium", displayInfo.color)}>
                  {displayInfo.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {status.bucketTokens}/{status.bucketSize}
                  </span>
                  {status.apiWeight !== undefined && (
                    <span className="text-muted-foreground">
                      W:{status.apiWeight}/{status.apiWeightLimit}
                    </span>
                  )}
                  <span className={cn("font-medium", getStatusColor(status))}>
                    {status.isDangerous ? '🔴' : bucketUsage >= 60 ? '🟠' : '🟢'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Progress 
                  value={bucketUsage} 
                  className="h-1.5 flex-1"
                  indicatorClassName={getUsageColor(bucketUsage)}
                />
              </div>
              {status.isDangerous && (
                <div className="flex items-center gap-1 text-[9px] text-destructive animate-pulse">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Rate limit critical - throttling active
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-2 border-t border-border">
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
        </div>
      </CardContent>
    </Card>
  );
}
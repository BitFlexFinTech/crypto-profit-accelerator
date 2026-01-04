import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Target, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface TimingAdvice {
  symbol: string;
  action: 'BUY' | 'SELL' | 'WAIT';
  confidence: number;
  timing: string;
}

export function TradeTiming() {
  const { signals, isEngineRunning, engineStatus, engineMetrics, isScanning } = useTrading();
  const [advice, setAdvice] = useState<TimingAdvice[]>([]);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const timingAdvice: TimingAdvice[] = signals.slice(0, 4).map(signal => ({
      symbol: signal.symbol,
      action: signal.direction === 'long' ? 'BUY' : 'SELL',
      confidence: signal.confidence * 100,
      timing: signal.estimatedTimeToProfit,
    }));

    setAdvice(timingAdvice);
  }, [signals]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 30 : prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (engineMetrics.lastScanTime) {
      setCountdown(30);
    }
  }, [engineMetrics.lastScanTime]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'bg-primary text-primary-foreground';
      case 'SELL': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="py-2 px-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Trade Timing
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isScanning && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {isScanning ? 'Scan' : `${countdown}s`}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 overflow-y-auto scrollbar-thin space-y-1.5">
        {/* Status Indicator */}
        <div className={cn(
          "flex items-center justify-between p-1.5 rounded text-[10px]",
          isScanning ? 'bg-primary/10' :
          engineStatus === 'trading' ? 'bg-warning/10' :
          isEngineRunning ? 'bg-primary/10' : 'bg-secondary/50'
        )}>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isScanning ? 'bg-primary animate-pulse' :
              engineStatus === 'trading' ? 'bg-warning animate-pulse' :
              isEngineRunning ? 'bg-primary' : 'bg-muted-foreground'
            )} />
            <span className="text-muted-foreground">
              {isScanning ? 'Scanning...' : isEngineRunning ? 'Monitoring' : 'Stopped'}
            </span>
          </div>
          {engineMetrics.lastScanTime && (
            <span className="text-muted-foreground">
              {formatDistanceToNow(engineMetrics.lastScanTime, { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Timing Recommendations */}
        {advice.length === 0 ? (
          <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
            <AlertCircle className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {isScanning ? 'Analyzing...' : 'Waiting for signals...'}
            </span>
          </div>
        ) : (
          advice.map((item, i) => (
            <div
              key={`${item.symbol}-${i}`}
              className="flex items-center justify-between p-1.5 rounded bg-secondary/30"
            >
              <div className="flex items-center gap-1.5">
                <Badge className={cn("text-[9px] px-1 py-0", getActionColor(item.action))}>
                  {item.action}
                </Badge>
                <span className="text-xs font-medium">{item.symbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{item.timing}</span>
                <div className="flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5 text-primary" />
                  <span className="text-[10px] font-medium text-primary tabular-nums">
                    {item.confidence.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

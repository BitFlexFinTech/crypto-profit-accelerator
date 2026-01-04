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
  reason: string;
}

export function TradeTiming() {
  const { signals, isEngineRunning, engineStatus, engineMetrics, isScanning } = useTrading();
  const [advice, setAdvice] = useState<TimingAdvice[]>([]);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    // Convert signals to timing advice
    const timingAdvice: TimingAdvice[] = signals.slice(0, 4).map(signal => ({
      symbol: signal.symbol,
      action: signal.direction === 'long' ? 'BUY' : 'SELL',
      confidence: signal.confidence * 100,
      timing: signal.estimatedTimeToProfit,
      reason: signal.reasoning.slice(0, 50) + '...',
    }));

    setAdvice(timingAdvice);
  }, [signals]);

  // Countdown to next analysis (background scan runs every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 30 : prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Reset countdown when a scan completes
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

  const getStatusDisplay = () => {
    if (isScanning || engineStatus === 'scanning' || engineStatus === 'analyzing') {
      return { text: 'Scanning...', icon: <Loader2 className="h-3 w-3 animate-spin" />, color: 'bg-primary/10' };
    }
    if (engineStatus === 'trading') {
      return { text: 'Executing...', icon: null, color: 'bg-warning/10' };
    }
    if (engineStatus === 'error') {
      return { text: 'Error', icon: null, color: 'bg-destructive/10' };
    }
    if (isEngineRunning) {
      return { text: 'Monitoring', icon: null, color: 'bg-primary/10' };
    }
    return { text: 'Bot Stopped', icon: null, color: 'bg-secondary/50' };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Trade Timing Advisor
          </CardTitle>
          <div className="flex items-center gap-2">
            {isScanning && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {isScanning ? 'Scanning' : `${countdown}s`}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status Indicator */}
        <div className={cn(
          "flex items-center justify-between p-2 rounded-lg transition-colors",
          statusDisplay.color
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isScanning ? 'bg-primary animate-pulse' :
              engineStatus === 'trading' ? 'bg-warning animate-pulse' :
              engineStatus === 'error' ? 'bg-destructive' :
              isEngineRunning ? 'bg-primary' : 'bg-muted-foreground'
            )} />
            <span className="text-xs text-muted-foreground">
              {statusDisplay.text}
            </span>
          </div>
          {engineMetrics.lastScanTime && (
            <span className="text-xs text-muted-foreground">
              Last scan: {formatDistanceToNow(engineMetrics.lastScanTime, { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Timing Recommendations */}
        {advice.length === 0 ? (
          <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {isScanning ? 'Analyzing markets...' : 'Waiting for signals...'}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {advice.map((item, i) => (
              <div
                key={item.symbol}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg bg-secondary/30",
                  "transition-all duration-300 hover:bg-secondary/50 animate-fade-in"
                )}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs", getActionColor(item.action))}>
                    {item.action}
                  </Badge>
                  <span className="text-sm font-medium">{item.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{item.timing}</p>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        {item.confidence.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hftCore } from '@/services/HFTCore';
import { wsManager } from '@/services/ExchangeWebSocketManager';
import { Zap, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExchangeName = 'binance' | 'okx' | 'bybit';

interface RTTStats {
  avg: number;
  p95: number;
  p99: number;
  spikes: number;
  histogram: number[];
}

const HISTOGRAM_BUCKETS = [25, 50, 100, 200, Infinity];
const BUCKET_LABELS = ['<25', '25-50', '50-100', '100-200', '200+'];

export function TradeExecutionSpeedPanel() {
  const [stats, setStats] = useState<RTTStats>({ avg: 0, p95: 0, p99: 0, spikes: 0, histogram: [0, 0, 0, 0, 0] });
  const [exchangeLatencies, setExchangeLatencies] = useState<Record<ExchangeName, number>>({} as Record<ExchangeName, number>);
  const [overallScore, setOverallScore] = useState(100);

  useEffect(() => {
    const update = () => {
      try {
        // Get RTT stats from HFTCore
        const rttStats = hftCore.getRTTStats();
        setStats(rttStats);

        // Get per-exchange latencies
        const latencyStatus = hftCore.getLatencyStatus();
        const latencies: Record<ExchangeName, number> = {} as Record<ExchangeName, number>;
        (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(ex => {
          latencies[ex] = latencyStatus[ex]?.rtt || 0;
        });
        setExchangeLatencies(latencies);

        // Calculate overall score (0-100)
        let score = 100;
        if (rttStats.avg > 50) score -= 10;
        if (rttStats.avg > 100) score -= 20;
        if (rttStats.p95 > 100) score -= 15;
        if (rttStats.p99 > 200) score -= 20;
        if (rttStats.spikes > 0) score -= rttStats.spikes * 5;
        setOverallScore(Math.max(0, Math.min(100, score)));
      } catch (error) {
        console.error('Failed to get RTT stats:', error);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-destructive';
  };

  const getMetricColor = (value: number, thresholds: [number, number]) => {
    if (value <= thresholds[0]) return 'text-green-500';
    if (value <= thresholds[1]) return 'text-yellow-500';
    return 'text-destructive';
  };

  const maxHistogramValue = Math.max(...stats.histogram, 1);

  return (
    <Card className="h-full bg-card/50 border-border">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            Execution Speed
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn("text-[10px] h-5", getScoreColor(overallScore))}
          >
            Score: {overallScore}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-3">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-muted/30 rounded p-1.5 text-center">
            <div className="text-[9px] text-muted-foreground">Avg RTT</div>
            <div className={cn("text-sm font-mono font-medium", getMetricColor(stats.avg, [50, 100]))}>
              {stats.avg}ms
            </div>
          </div>
          <div className="bg-muted/30 rounded p-1.5 text-center">
            <div className="text-[9px] text-muted-foreground">P95 RTT</div>
            <div className={cn("text-sm font-mono font-medium", getMetricColor(stats.p95, [100, 150]))}>
              {stats.p95}ms
            </div>
          </div>
          <div className="bg-muted/30 rounded p-1.5 text-center">
            <div className="text-[9px] text-muted-foreground">P99 RTT</div>
            <div className={cn("text-sm font-mono font-medium", getMetricColor(stats.p99, [150, 200]))}>
              {stats.p99}ms
            </div>
          </div>
          <div className="bg-muted/30 rounded p-1.5 text-center">
            <div className="text-[9px] text-muted-foreground">Spikes</div>
            <div className={cn("text-sm font-mono font-medium", stats.spikes > 0 ? 'text-destructive' : 'text-green-500')}>
              {stats.spikes}
            </div>
          </div>
        </div>

        {/* RTT Histogram */}
        <div className="space-y-1">
          <div className="text-[9px] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" />
            RTT Distribution (5 min)
          </div>
          <div className="flex items-end gap-0.5 h-10">
            {stats.histogram.map((count, idx) => {
              const height = maxHistogramValue > 0 ? (count / maxHistogramValue) * 100 : 0;
              const color = idx < 2 ? 'bg-green-500' : idx < 3 ? 'bg-yellow-500' : idx < 4 ? 'bg-orange-500' : 'bg-destructive';
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                  <div 
                    className={cn("w-full rounded-t transition-all", color)}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-0.5">
            {BUCKET_LABELS.map((label, idx) => (
              <div key={idx} className="flex-1 text-[8px] text-muted-foreground text-center">
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Per-Exchange Latency */}
        <div className="pt-2 border-t border-border">
          <div className="text-[9px] text-muted-foreground mb-1.5 flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" />
            Per-Exchange Latency
          </div>
          <div className="flex gap-2">
            {(['binance', 'okx', 'bybit'] as ExchangeName[]).map((ex) => {
              const latency = exchangeLatencies[ex] || 0;
              return (
                <div key={ex} className="flex items-center gap-1 text-[10px]">
                  <span className="font-medium capitalize">{ex.slice(0, 2).toUpperCase()}:</span>
                  <span className={cn("font-mono", getMetricColor(latency, [50, 100]))}>
                    {latency}ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Warning if spikes detected */}
        {stats.spikes > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive bg-destructive/10 rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            {stats.spikes} latency spike{stats.spikes > 1 ? 's' : ''} detected in last hour
          </div>
        )}
      </CardContent>
    </Card>
  );
}
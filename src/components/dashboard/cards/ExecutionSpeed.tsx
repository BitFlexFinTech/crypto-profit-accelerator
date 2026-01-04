import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Gauge } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface SpeedMetric {
  label: string;
  value: number;
  unit: string;
  status: 'fast' | 'normal' | 'slow';
}

export function ExecutionSpeed() {
  const { engineMetrics, connectionStates, isEngineRunning } = useTrading();
  const [metrics, setMetrics] = useState<SpeedMetric[]>([]);
  const [avgLatency, setAvgLatency] = useState(0);

  useEffect(() => {
    const latencies = Object.values(connectionStates)
      .filter(s => s.connected)
      .map(s => s.latency);
    const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    setAvgLatency(avg);

    setMetrics([
      {
        label: 'Analysis',
        value: engineMetrics.analysisTime,
        unit: 'ms',
        status: engineMetrics.analysisTime < 500 ? 'fast' : engineMetrics.analysisTime < 2000 ? 'normal' : 'slow',
      },
      {
        label: 'Execution',
        value: engineMetrics.executionTime,
        unit: 'ms',
        status: engineMetrics.executionTime < 200 ? 'fast' : engineMetrics.executionTime < 1000 ? 'normal' : 'slow',
      },
      {
        label: 'Cycle',
        value: engineMetrics.cycleTime,
        unit: 'ms',
        status: engineMetrics.cycleTime < 1000 ? 'fast' : engineMetrics.cycleTime < 5000 ? 'normal' : 'slow',
      },
      {
        label: 'Latency',
        value: avg,
        unit: 'ms',
        status: avg < 50 ? 'fast' : avg < 200 ? 'normal' : 'slow',
      },
    ]);
  }, [engineMetrics, connectionStates]);

  const overallScore = metrics.filter(m => m.status === 'fast').length;
  const speedPercentage = (overallScore / Math.max(metrics.length, 1)) * 100;

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Execution Speed
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-medium",
            speedPercentage >= 75 ? "text-primary" : speedPercentage >= 50 ? "text-warning" : "text-destructive"
          )}>
            <Gauge className="h-3 w-3" />
            {speedPercentage.toFixed(0)}%
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-3">
        {/* Speed Gauge - Compact */}
        <div className="flex items-center justify-center">
          <div className="relative w-20 h-10 overflow-hidden">
            <div className="absolute inset-0 border-4 border-b-0 border-secondary rounded-t-full" />
            <div
              className={cn(
                "absolute inset-0 border-4 border-b-0 rounded-t-full transition-all duration-700",
                speedPercentage >= 75 ? "border-primary" : speedPercentage >= 50 ? "border-warning" : "border-destructive"
              )}
              style={{
                clipPath: `polygon(0 100%, 0 0, ${speedPercentage}% 0, ${speedPercentage}% 100%)`,
              }}
            />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
              <p className={cn(
                "text-base font-bold tabular-nums",
                speedPercentage >= 75 ? "text-primary" : speedPercentage >= 50 ? "text-warning" : "text-destructive"
              )}>
                {isEngineRunning ? (avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : '--') : 'OFF'}
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {metrics.map((metric, i) => (
            <div
              key={metric.label}
              className="p-1.5 rounded bg-secondary/50"
            >
              <p className="text-[10px] text-muted-foreground">{metric.label}</p>
              <div className="flex items-baseline gap-0.5">
                <span className={cn(
                  "font-mono text-sm font-bold tabular-nums",
                  metric.status === 'fast' ? 'text-primary' :
                  metric.status === 'normal' ? 'text-warning' : 'text-destructive'
                )}>
                  {metric.value > 0 ? metric.value.toFixed(0) : '--'}
                </span>
                <span className="text-[10px] text-muted-foreground">{metric.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

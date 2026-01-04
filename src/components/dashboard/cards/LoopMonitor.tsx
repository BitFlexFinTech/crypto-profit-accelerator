import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { useTrading } from '@/contexts/TradingContext';
import { cn } from '@/lib/utils';

interface LoopStep {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration?: number;
}

export function LoopMonitor() {
  const { isEngineRunning, engineStatus, engineMetrics, positions, signals } = useTrading();
  const [steps, setSteps] = useState<LoopStep[]>([]);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    const newSteps: LoopStep[] = [
      {
        name: 'Fetch Prices',
        status: isEngineRunning ? 'complete' : 'pending',
        duration: 50,
      },
      {
        name: 'Analyze',
        status: engineStatus === 'analyzing' ? 'running' :
                signals.length > 0 ? 'complete' : 'pending',
        duration: engineMetrics.analysisTime,
      },
      {
        name: 'Check Pos',
        status: positions.length > 0 ? 'complete' : 'pending',
        duration: 20,
      },
      {
        name: 'Execute',
        status: engineStatus === 'trading' ? 'running' :
                engineStatus === 'monitoring' && signals.length > 0 ? 'complete' : 'pending',
        duration: engineMetrics.executionTime,
      },
    ];

    setSteps(newSteps);
  }, [isEngineRunning, engineStatus, engineMetrics, positions, signals]);

  useEffect(() => {
    if (engineStatus === 'monitoring' && isEngineRunning) {
      setCycleCount(prev => prev + 1);
    }
  }, [engineStatus, isEngineRunning]);

  const getStatusIcon = (status: LoopStep['status']) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-2.5 w-2.5 text-primary" />;
      case 'running': return <Loader2 className="h-2.5 w-2.5 text-warning animate-spin" />;
      case 'error': return <XCircle className="h-2.5 w-2.5 text-destructive" />;
      default: return <Clock className="h-2.5 w-2.5 text-muted-foreground" />;
    }
  };

  const completedSteps = steps.filter(s => s.status === 'complete').length;
  const progress = (completedSteps / steps.length) * 100;

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className={cn(
              "h-4 w-4 text-primary",
              isEngineRunning && "animate-spin"
            )} />
            Loop Monitor
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono px-1.5">
            #{cycleCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-3">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium tabular-nums">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps List - Compact */}
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div
              key={step.name}
              className={cn(
                "flex items-center justify-between p-1.5 rounded text-[10px]",
                step.status === 'running' ? 'bg-warning/10' :
                step.status === 'complete' ? 'bg-primary/5' :
                'bg-secondary/30'
              )}
            >
              <div className="flex items-center gap-1.5">
                {getStatusIcon(step.status)}
                <span className={cn(
                  step.status === 'running' ? 'text-warning font-medium' :
                  step.status === 'complete' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.name}
                </span>
              </div>
              {step.duration !== undefined && step.status === 'complete' && (
                <span className="font-mono text-muted-foreground tabular-nums">
                  {step.duration}ms
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border">
          <div className="text-center">
            <p className="text-sm font-bold text-primary tabular-nums">{positions.length}</p>
            <p className="text-[9px] text-muted-foreground">Open</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground tabular-nums">{signals.length}</p>
            <p className="text-[9px] text-muted-foreground">Signals</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground tabular-nums">
              {engineMetrics.cycleTime > 0 ? `${(engineMetrics.cycleTime / 1000).toFixed(1)}s` : '--'}
            </p>
            <p className="text-[9px] text-muted-foreground">Cycle</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

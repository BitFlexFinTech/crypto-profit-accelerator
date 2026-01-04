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
    // Generate loop steps based on engine status
    const newSteps: LoopStep[] = [
      {
        name: 'Fetch Prices',
        status: isEngineRunning ? 'complete' : 'pending',
        duration: 50,
      },
      {
        name: 'Analyze Pairs',
        status: engineStatus === 'analyzing' ? 'running' :
                signals.length > 0 ? 'complete' : 'pending',
        duration: engineMetrics.analysisTime,
      },
      {
        name: 'Check Positions',
        status: positions.length > 0 ? 'complete' : 'pending',
        duration: 20,
      },
      {
        name: 'Execute Trades',
        status: engineStatus === 'trading' ? 'running' :
                engineStatus === 'monitoring' && signals.length > 0 ? 'complete' : 'pending',
        duration: engineMetrics.executionTime,
      },
      {
        name: 'Monitor P&L',
        status: engineStatus === 'monitoring' ? 'running' : 'pending',
        duration: 10,
      },
    ];

    setSteps(newSteps);
  }, [isEngineRunning, engineStatus, engineMetrics, positions, signals]);

  // Increment cycle count when a full cycle completes
  useEffect(() => {
    if (engineStatus === 'monitoring' && isEngineRunning) {
      setCycleCount(prev => prev + 1);
    }
  }, [engineStatus, isEngineRunning]);

  const getStatusIcon = (status: LoopStep['status']) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-3 w-3 text-primary" />;
      case 'running': return <Loader2 className="h-3 w-3 text-warning animate-spin" />;
      case 'error': return <XCircle className="h-3 w-3 text-destructive" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const completedSteps = steps.filter(s => s.status === 'complete').length;
  const progress = (completedSteps / steps.length) * 100;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <RefreshCw className={cn(
              "h-4 w-4 text-primary",
              isEngineRunning && "animate-spin"
            )} />
            Trading Loop Monitor
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            Cycle #{cycleCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Loop Progress</span>
            <span className="font-medium">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div
              key={step.name}
              className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-all duration-300",
                step.status === 'running' ? 'bg-warning/10' :
                step.status === 'complete' ? 'bg-primary/5' :
                step.status === 'error' ? 'bg-destructive/10' : 'bg-secondary/30'
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-2">
                {getStatusIcon(step.status)}
                <span className={cn(
                  "text-xs",
                  step.status === 'running' ? 'text-warning font-medium' :
                  step.status === 'complete' ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {step.name}
                </span>
              </div>
              {step.duration !== undefined && step.status === 'complete' && (
                <span className="text-xs font-mono text-muted-foreground">
                  {step.duration}ms
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
          <div className="text-center">
            <p className="text-lg font-bold text-primary">{positions.length}</p>
            <p className="text-xs text-muted-foreground">Open</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{signals.length}</p>
            <p className="text-xs text-muted-foreground">Signals</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">
              {engineMetrics.cycleTime > 0 ? `${(engineMetrics.cycleTime / 1000).toFixed(1)}s` : '--'}
            </p>
            <p className="text-xs text-muted-foreground">Cycle</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

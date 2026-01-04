import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTrading } from '@/contexts/TradingContext';
import { Activity, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SignalDebugPanel() {
  const { signals, settings, positions, exchanges, engineStatus, engineMetrics, isEngineRunning } = useTrading();

  // Calculate thresholds based on aggressiveness
  const confidenceThreshold = settings?.ai_aggressiveness === 'aggressive' ? 0.4 :
                              settings?.ai_aggressiveness === 'conservative' ? 0.7 : 0.5;
  
  const scoreThreshold = settings?.ai_aggressiveness === 'aggressive' ? 40 :
                         settings?.ai_aggressiveness === 'conservative' ? 60 : 45;

  const maxPositions = settings?.max_open_positions || 10;
  const currentPositions = positions.length;
  const connectedExchanges = exchanges.filter(e => e.is_connected);

  // Determine why trades aren't executing
  const getExecutionBlocker = () => {
    if (!isEngineRunning) return { reason: 'Bot is stopped', type: 'stopped' };
    if (connectedExchanges.length === 0) return { reason: 'No exchanges connected', type: 'no_exchange' };
    if (currentPositions >= maxPositions) return { reason: `Max positions reached (${currentPositions}/${maxPositions})`, type: 'max_positions' };
    if (signals.length === 0) return { reason: 'No signals from AI analysis', type: 'no_signals' };
    
    const topSignal = signals[0];
    if (topSignal.score < scoreThreshold) return { reason: `Score ${topSignal.score} < ${scoreThreshold} threshold`, type: 'low_score' };
    if (topSignal.confidence < confidenceThreshold) return { reason: `Confidence ${(topSignal.confidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}% threshold`, type: 'low_confidence' };
    
    return { reason: 'Ready to execute', type: 'ready' };
  };

  const blocker = getExecutionBlocker();
  const timeSinceLastScan = engineMetrics.lastScanTime 
    ? Math.floor((Date.now() - engineMetrics.lastScanTime.getTime()) / 1000)
    : null;

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Signal Debug Panel
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isEngineRunning ? 'default' : 'secondary'} className="text-xs">
              {isEngineRunning ? '🟢 LIVE' : '⚪ STOPPED'}
            </Badge>
            {timeSinceLastScan !== null && (
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {timeSinceLastScan}s ago
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thresholds & Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-muted-foreground text-xs">Score Threshold</div>
            <div className="font-mono font-semibold">≥ {scoreThreshold}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-muted-foreground text-xs">Confidence Threshold</div>
            <div className="font-mono font-semibold">≥ {(confidenceThreshold * 100).toFixed(0)}%</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-muted-foreground text-xs">Mode</div>
            <div className="font-mono font-semibold capitalize">{settings?.ai_aggressiveness || 'balanced'}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="text-muted-foreground text-xs">Positions</div>
            <div className="font-mono font-semibold">{currentPositions} / {maxPositions}</div>
          </div>
        </div>

        {/* Execution Status */}
        <div className={cn(
          "p-3 rounded-lg border",
          blocker.type === 'ready' ? 'bg-green-500/10 border-green-500/30' :
          blocker.type === 'stopped' ? 'bg-muted border-muted' :
          'bg-yellow-500/10 border-yellow-500/30'
        )}>
          <div className="flex items-center gap-2">
            {blocker.type === 'ready' ? (
              <Zap className="h-4 w-4 text-green-500" />
            ) : (
              <Clock className="h-4 w-4 text-yellow-500" />
            )}
            <span className="font-medium">{blocker.reason}</span>
          </div>
        </div>

        {/* Signals Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs border-b">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Symbol</th>
                <th className="text-center py-2 px-2">Score</th>
                <th className="text-center py-2 px-2">Confidence</th>
                <th className="text-center py-2 px-2">Direction</th>
                <th className="text-center py-2 px-2">Type</th>
                <th className="text-left py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted-foreground">
                    No signals available - waiting for AI analysis
                  </td>
                </tr>
              ) : (
                signals.slice(0, 8).map((signal, idx) => {
                  const passesScore = signal.score >= scoreThreshold;
                  const passesConfidence = signal.confidence >= confidenceThreshold;
                  const isTop = idx === 0 && passesScore && passesConfidence;
                  
                  return (
                    <tr key={`${signal.symbol}-${idx}`} className={cn(
                      "border-b border-muted/50",
                      isTop && "bg-green-500/5"
                    )}>
                      <td className="py-2 px-2 font-mono">{idx + 1}</td>
                      <td className="py-2 px-2 font-semibold">{signal.symbol}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="flex items-center justify-center gap-1 font-mono">
                          {signal.score}
                          {passesScore ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="flex items-center justify-center gap-1 font-mono">
                          {(signal.confidence * 100).toFixed(0)}%
                          {passesConfidence ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Badge variant={signal.direction === 'long' ? 'default' : 'destructive'} className="text-xs">
                          {signal.direction.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Badge variant="outline" className="text-xs">
                          {signal.tradeType}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        {isTop ? (
                          <span className="flex items-center gap-1 text-green-500 font-medium">
                            <Zap className="h-3 w-3" /> READY
                          </span>
                        ) : !passesScore ? (
                          <span className="text-muted-foreground text-xs">Low score</span>
                        ) : !passesConfidence ? (
                          <span className="text-muted-foreground text-xs">Low conf</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Queued</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Engine Metrics */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>Cycle: {engineMetrics.cycleTime}ms</span>
          <span>Analysis: {engineMetrics.analysisTime}ms</span>
          <span>Execution: {engineMetrics.executionTime}ms</span>
          <span>Status: {engineStatus}</span>
        </div>
      </CardContent>
    </Card>
  );
}

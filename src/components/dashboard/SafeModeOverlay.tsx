import { useState, useEffect, useCallback } from 'react';
import { hftCore, HFTState, LatencyHeartbeat } from '@/services/HFTCore';
import { AlertTriangle, Clock, Shield, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type ExchangeName = 'binance' | 'okx' | 'bybit' | 'kucoin' | 'hyperliquid';

const EXPECTED_RECOVERY_TIME_MS = 60000; // 60 seconds estimated recovery

export function SafeModeOverlay() {
  const [state, setState] = useState<HFTState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const unsubscribe = hftCore.onStateChange((newState) => {
      setState(newState);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!state?.isSafeMode || !state.safeModeEnteredAt) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - state.safeModeEnteredAt!);
    }, 100);

    return () => clearInterval(interval);
  }, [state?.isSafeMode, state?.safeModeEnteredAt]);

  const handleForceResume = useCallback(() => {
    try {
      hftCore.forceExitSafeMode();
    } catch (error) {
      console.error('Failed to force exit safe mode:', error);
    }
  }, []);

  if (!state?.isSafeMode) {
    return null;
  }

  const progress = Math.min((elapsed / EXPECTED_RECOVERY_TIME_MS) * 100, 100);
  const remainingMs = Math.max(EXPECTED_RECOVERY_TIME_MS - elapsed, 0);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const latencyStatus = hftCore.getLatencyStatus();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center animate-pulse">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Safe Mode Active</h2>
            <p className="text-sm text-muted-foreground">Trading paused for safety</p>
          </div>
        </div>

        {/* Reason */}
        <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3 mb-4">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-foreground">Reason: </span>
              <span className="text-muted-foreground">{state.safeModeReason}</span>
            </div>
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="bg-muted/50 rounded-md p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Waiting for stable connection...
            </span>
            <span className="text-sm font-mono font-medium text-foreground">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Status List */}
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
            New entries <span className="font-medium text-destructive">PAUSED</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Exit orders <span className="font-medium text-green-500">ALLOWED</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Monitoring for 3 consecutive low-latency checks
          </div>
        </div>

        {/* Latency Details (Expandable) */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-primary hover:underline flex items-center gap-1 mb-4"
        >
          <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-90")} />
          {showDetails ? 'Hide' : 'View'} Latency Details
        </button>

        {showDetails && (
          <div className="bg-muted/30 rounded-md p-3 mb-4 space-y-2">
            {(['binance', 'okx', 'bybit'] as ExchangeName[]).map((exchange) => {
              const heartbeat = latencyStatus[exchange];
              if (!heartbeat) return null;
              
              return (
                <div key={exchange} className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">{exchange}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-mono",
                      heartbeat.healthy ? "text-green-500" : "text-destructive"
                    )}>
                      {heartbeat.rtt}ms
                    </span>
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      heartbeat.healthy ? "bg-green-500" : "bg-destructive animate-pulse"
                    )} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleForceResume}
          >
            <Zap className="h-4 w-4 mr-1.5" />
            Force Resume
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-3">
          Force resuming may expose you to execution risks during high latency
        </p>
      </div>
    </div>
  );
}
import { useEffect, useState, useMemo } from 'react';
import { Target, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfitProgressIndicatorProps {
  currentPnl: number;
  profitTarget: number;
  openedAt: string | null;
  symbol: string;
  isClosing?: boolean;
}

export function ProfitProgressIndicator({
  currentPnl,
  profitTarget,
  openedAt,
  symbol,
  isClosing = false,
}: ProfitProgressIndicatorProps) {
  const [now, setNow] = useState(Date.now());
  
  // Update every 100ms for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  const progress = useMemo(() => {
    return Math.min(100, Math.max(0, (currentPnl / profitTarget) * 100));
  }, [currentPnl, profitTarget]);

  const elapsedTime = useMemo(() => {
    if (!openedAt) return { seconds: 0, formatted: '0:00' };
    const elapsedMs = now - new Date(openedAt).getTime();
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return { 
      seconds: totalSeconds,
      formatted: `${minutes}:${seconds.toString().padStart(2, '0')}`
    };
  }, [openedAt, now]);

  const eta = useMemo(() => {
    if (!openedAt || elapsedTime.seconds < 10 || currentPnl <= 0) return null;
    
    const pnlRatePerSec = currentPnl / elapsedTime.seconds;
    if (pnlRatePerSec <= 0) return null;
    
    const remainingPnl = profitTarget - currentPnl;
    if (remainingPnl <= 0) return { seconds: 0, formatted: 'NOW!' };
    
    const remainingSec = Math.ceil(remainingPnl / pnlRatePerSec);
    
    if (remainingSec < 60) return { seconds: remainingSec, formatted: `${remainingSec}s` };
    if (remainingSec < 3600) {
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      return { seconds: remainingSec, formatted: `${mins}:${secs.toString().padStart(2, '0')}` };
    }
    return { seconds: remainingSec, formatted: `${Math.floor(remainingSec / 3600)}h` };
  }, [currentPnl, profitTarget, elapsedTime.seconds, openedAt]);

  const progressColor = useMemo(() => {
    if (progress >= 100) return 'text-primary';
    if (progress >= 75) return 'text-chart-2'; // green
    if (progress >= 50) return 'text-chart-3'; // yellow
    return 'text-muted-foreground';
  }, [progress]);

  const ringColor = useMemo(() => {
    if (progress >= 100) return 'stroke-primary';
    if (progress >= 75) return 'stroke-chart-2';
    if (progress >= 50) return 'stroke-chart-3';
    return 'stroke-muted-foreground/50';
  }, [progress]);

  const isPulsing = progress >= 90 && progress < 100;

  // If closing, show closing indicator
  if (isClosing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-primary/20 border border-primary/30">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs font-medium text-primary">CLOSING...</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/50",
      isPulsing && "animate-pulse"
    )}>
      {/* Circular Progress Ring */}
      <div className="relative h-10 w-10">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
          {/* Background circle */}
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="3"
            className="stroke-muted/30"
          />
          {/* Progress circle */}
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="3"
            strokeDasharray={`${progress * 0.942} 100`}
            strokeLinecap="round"
            className={cn("transition-all duration-200", ringColor)}
          />
        </svg>
        {/* Center percentage */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-[10px] font-bold", progressColor)}>
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Progress Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Target:</span>
            <span className="font-medium text-foreground">${profitTarget.toFixed(2)}</span>
          </div>
          <div className={cn("font-mono font-medium", progressColor)}>
            ${currentPnl.toFixed(2)}
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs mt-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Elapsed: {elapsedTime.formatted}</span>
          </div>
          {eta && (
            <div className={cn(
              "flex items-center gap-1 font-medium",
              eta.seconds === 0 ? "text-primary" : "text-foreground"
            )}>
              <span>ETA:</span>
              <span className={cn(
                "font-mono",
                eta.seconds === 0 && "text-primary animate-bounce"
              )}>
                {eta.formatted}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

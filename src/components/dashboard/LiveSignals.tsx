import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Zap, RefreshCw, Clock, Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function LiveSignals() {
  const { signals, engineStatus, forceAnalyze, isScanning, engineMetrics, slowPairBlacklist, getPairSpeedScore } = useTrading();
  
  const isAnalyzing = engineStatus === 'analyzing' || isScanning;

  const handleRefresh = async () => {
    try {
      await forceAnalyze();
      toast.success('Analysis Complete', { dismissible: true });
    } catch {
      toast.error('Analysis failed', { dismissible: true });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-primary';
    if (score >= 60) return 'text-yellow-500';
    return 'text-muted-foreground';
  };

  const getVolatilityBadge = (volatility: string) => {
    const colors: Record<string, string> = {
      low: 'bg-blue-500/20 text-blue-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      high: 'bg-red-500/20 text-red-400',
    };
    return colors[volatility] || '';
  };

  const blacklistedCount = signals.filter(s => slowPairBlacklist.has(s.symbol)).length;

  return (
    <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between flex-shrink-0 py-1.5 px-2">
        <div className="min-w-0">
          <CardTitle className="text-foreground flex items-center gap-1.5 text-xs">
            <Zap className="h-3 w-3 text-primary flex-shrink-0" />
            Live Signals
            {isScanning && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1 py-0">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Scan
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5 mt-0.5">
            {engineMetrics.lastScanTime && (
              <p className="text-[10px] text-muted-foreground truncate">
                {formatDistanceToNow(engineMetrics.lastScanTime, { addSuffix: true })}
              </p>
            )}
            {blacklistedCount > 0 && (
              <Badge variant="destructive" className="text-[8px] gap-0.5 px-1 py-0">
                <Ban className="h-2 w-2" />
                {blacklistedCount}
              </Badge>
            )}
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isAnalyzing}
          className="h-6 px-2 text-[10px]"
        >
          <RefreshCw className={`h-2.5 w-2.5 mr-0.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? 'Scan' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
        {isAnalyzing && signals.length === 0 ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Zap className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">No signals</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1 p-1.5">
              {signals.slice(0, 8).map((signal, index) => {
                const isBlacklisted = slowPairBlacklist.has(signal.symbol);
                const speedScore = getPairSpeedScore(signal.symbol);
                
                return (
                  <div 
                    key={`${signal.symbol}-${index}`}
                    className={cn(
                      "flex items-center justify-between p-1.5 rounded bg-secondary/50 border border-border/50",
                      isBlacklisted && "opacity-50 border-destructive/30"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="flex flex-col items-center w-8 flex-shrink-0">
                        <Badge 
                          variant="outline" 
                          className={`text-[8px] font-bold px-1 py-0 ${
                            index === 0 ? 'border-yellow-500 text-yellow-500' :
                            index === 1 ? 'border-gray-400 text-gray-400' :
                            'border-muted-foreground'
                          }`}
                        >
                          #{index + 1}
                        </Badge>
                        <span className={`text-sm font-bold ${getScoreColor(signal.score)}`}>
                          {signal.score}
                        </span>
                      </div>
                      
                      <div className="min-w-0 border-l border-border pl-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={cn("font-medium text-foreground text-xs truncate", isBlacklisted && "line-through")}>
                            {signal.symbol}
                          </span>
                          <Badge 
                            variant={signal.direction === 'long' ? 'default' : 'destructive'}
                            className="text-[8px] px-1 py-0"
                          >
                            {signal.direction === 'long' ? <TrendingUp className="h-2 w-2" /> : <TrendingDown className="h-2 w-2" />}
                          </Badge>
                          {isBlacklisted && <Ban className="h-2.5 w-2.5 text-destructive" />}
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                          <span className="capitalize">{signal.exchange}</span>
                          <Badge className={`text-[8px] px-0.5 py-0 ${getVolatilityBadge(signal.volatility)}`}>
                            {signal.volatility[0]}
                          </Badge>
                          <span className={cn(
                            speedScore >= 80 ? 'text-primary' :
                            speedScore >= 50 ? 'text-yellow-500' :
                            'text-destructive'
                          )}>
                            S:{speedScore}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-[10px] text-foreground">
                        ${signal.entryPrice.toFixed(2)}
                      </div>
                      <div className="flex items-center gap-0.5 text-[9px] text-primary">
                        <Clock className="h-2 w-2" />
                        {signal.estimatedTimeToProfit}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
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
      <CardHeader className="flex flex-row items-center justify-between flex-shrink-0 pb-2">
        <div>
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Live Signals
            {isScanning && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Scanning
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1">
            {engineMetrics.lastScanTime && (
              <p className="text-xs text-muted-foreground">
                Updated: {formatDistanceToNow(engineMetrics.lastScanTime, { addSuffix: true })}
              </p>
            )}
            {blacklistedCount > 0 && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <Ban className="h-2.5 w-2.5" />
                {blacklistedCount} slow
              </Badge>
            )}
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isAnalyzing}
          className="h-8"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? 'Scanning' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {isAnalyzing && signals.length === 0 ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No signals available</p>
            <p className="text-xs mt-1">AI is scanning markets every 2s</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 p-4 pt-0">
              {signals.slice(0, 6).map((signal, index) => {
                const isBlacklisted = slowPairBlacklist.has(signal.symbol);
                const speedScore = getPairSpeedScore(signal.symbol);
                
                return (
                  <div 
                    key={`${signal.symbol}-${index}`}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border animate-fade-in",
                      isBlacklisted && "opacity-60 border-destructive/30"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      {/* Rank & Score */}
                      <div className="flex flex-col items-center min-w-[40px]">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] font-bold px-1.5 py-0 ${
                            index === 0 ? 'border-yellow-500 text-yellow-500' :
                            index === 1 ? 'border-gray-400 text-gray-400' :
                            index === 2 ? 'border-amber-600 text-amber-600' :
                            'border-muted-foreground'
                          }`}
                        >
                          #{index + 1}
                        </Badge>
                        <span className={`text-lg font-bold ${getScoreColor(signal.score)}`}>
                          {signal.score}
                        </span>
                      </div>
                      
                      <div className="border-l border-border pl-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("font-medium text-foreground text-sm", isBlacklisted && "line-through")}>
                            {signal.symbol}
                          </span>
                          <Badge 
                            variant={signal.direction === 'long' ? 'default' : 'destructive'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {signal.direction === 'long' ? (
                              <><TrendingUp className="h-2.5 w-2.5 mr-0.5" />LONG</>
                            ) : (
                              <><TrendingDown className="h-2.5 w-2.5 mr-0.5" />SHORT</>
                            )}
                          </Badge>
                          {isBlacklisted && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
                              <Ban className="h-2.5 w-2.5" /> SLOW
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="capitalize">{signal.exchange}</span>
                          <span>•</span>
                          <Badge className={`text-[10px] px-1 py-0 ${getVolatilityBadge(signal.volatility)}`}>
                            {signal.volatility}
                          </Badge>
                          <span>•</span>
                          <span className={cn(
                            "font-medium",
                            speedScore >= 80 ? 'text-primary' :
                            speedScore >= 50 ? 'text-yellow-500' :
                            'text-destructive'
                          )}>
                            Speed: {speedScore}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs text-foreground">
                        ${signal.entryPrice.toFixed(4)}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-primary">
                        <Clock className="h-2.5 w-2.5" />
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
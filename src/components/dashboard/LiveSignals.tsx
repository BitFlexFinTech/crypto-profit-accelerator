import { useTrading } from '@/contexts/TradingContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Zap, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export function LiveSignals() {
  const { signals, engineStatus, forceAnalyze, isScanning, engineMetrics } = useTrading();
  
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

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Live Trading Signals
            {isScanning && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Scanning
              </Badge>
            )}
          </CardTitle>
          {engineMetrics.lastScanTime && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {formatDistanceToNow(engineMetrics.lastScanTime, { addSuffix: true })}
            </p>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isAnalyzing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? 'Analyzing...' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {isAnalyzing && signals.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No signals available</p>
            <p className="text-sm mt-1">AI is scanning markets every 30 seconds</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.slice(0, 5).map((signal, index) => (
              <div 
                key={`${signal.symbol}-${index}`}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* Speed Rank Badge */}
                  <div className="flex flex-col items-center">
                    <Badge 
                      variant="outline" 
                      className={`text-xs font-bold ${
                        index === 0 ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' :
                        index === 1 ? 'border-gray-400 text-gray-400 bg-gray-400/10' :
                        index === 2 ? 'border-amber-600 text-amber-600 bg-amber-600/10' :
                        'border-muted-foreground'
                      }`}
                    >
                      #{index + 1}
                    </Badge>
                    <span className={`text-2xl font-bold mt-1 ${getScoreColor(signal.score)}`}>
                      {signal.score}
                    </span>
                    <span className="text-xs text-muted-foreground">score</span>
                  </div>
                  <div className="border-l border-border pl-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{signal.symbol}</span>
                      <Badge 
                        variant={signal.direction === 'long' ? 'default' : 'destructive'}
                        className={signal.direction === 'long' ? 'bg-primary text-primary-foreground' : ''}
                      >
                        {signal.direction === 'long' ? (
                          <><TrendingUp className="h-3 w-3 mr-1" />LONG</>
                        ) : (
                          <><TrendingDown className="h-3 w-3 mr-1" />SHORT</>
                        )}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {signal.tradeType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="capitalize">{signal.exchange}</span>
                      <span>•</span>
                      <Badge className={`text-xs ${getVolatilityBadge(signal.volatility)}`}>
                        {signal.volatility} vol
                      </Badge>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <Clock className="h-3 w-3" />
                        {signal.estimatedTimeToProfit}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-foreground">
                    ${signal.entryPrice.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(signal.confidence * 100).toFixed(0)}% confidence
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

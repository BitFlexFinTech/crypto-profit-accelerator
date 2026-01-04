import { useTradingEngine } from '@/hooks/useTradingEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Zap, RefreshCw, Clock } from 'lucide-react';

interface TradingSignal {
  exchange: string;
  symbol: string;
  direction: 'long' | 'short';
  score: number;
  confidence: number;
  volatility: 'low' | 'medium' | 'high';
  momentum: 'bearish' | 'neutral' | 'bullish';
  estimatedTimeToProfit: string;
  entryPrice: number;
  targetPrice: number;
  reasoning: string;
  tradeType: 'spot' | 'futures';
}

export function LiveSignals() {
  const { engineState, forceAnalyze } = useTradingEngine();
  
  const signals = engineState.currentSignals as TradingSignal[];
  const isAnalyzing = engineState.status === 'analyzing';

  const handleRefresh = async () => {
    await forceAnalyze();
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
          </CardTitle>
          {engineState.lastAnalysis && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {engineState.lastAnalysis.toLocaleTimeString()}
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
        {isAnalyzing ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No signals available</p>
            <p className="text-sm mt-1">Start the bot to begin analyzing pairs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.slice(0, 5).map((signal, index) => (
              <div 
                key={`${signal.symbol}-${index}`}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`text-2xl font-bold ${getScoreColor(signal.score)}`}>
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
                      <span className="flex items-center gap-1">
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

        {engineState.lastError && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{engineState.lastError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

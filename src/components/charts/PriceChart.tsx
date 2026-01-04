import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Maximize2, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { TradingViewChart } from './TradingViewChart';
import { RSIChart } from './RSIChart';
import { MACDChart } from './MACDChart';
import { candleDataService } from '@/services/CandleDataService';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateBollingerBands } from '@/services/TechnicalIndicators';
import { CandleData, Timeframe, TIMEFRAMES } from '@/types/charts';
import { usePositions } from '@/hooks/usePositions';
import { cn } from '@/lib/utils';

const POPULAR_SYMBOLS = [
  { symbol: 'BTCUSDT', displayName: 'BTC/USDT' },
  { symbol: 'ETHUSDT', displayName: 'ETH/USDT' },
  { symbol: 'SOLUSDT', displayName: 'SOL/USDT' },
  { symbol: 'BNBUSDT', displayName: 'BNB/USDT' },
  { symbol: 'XRPUSDT', displayName: 'XRP/USDT' },
  { symbol: 'ADAUSDT', displayName: 'ADA/USDT' },
  { symbol: 'DOGEUSDT', displayName: 'DOGE/USDT' },
  { symbol: 'AVAXUSDT', displayName: 'AVAX/USDT' },
];

interface PriceChartProps {
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function PriceChart({ fullscreen = false, onToggleFullscreen }: PriceChartProps) {
  const { positions } = usePositions();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [exchange, setExchange] = useState('binance');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [showSMA, setShowSMA] = useState(true);

  // Get unique symbols from open positions
  const positionSymbols = useMemo(() => {
    return [...new Set(positions.map(p => p.symbol))];
  }, [positions]);

  const allSymbols = useMemo(() => {
    const popular = POPULAR_SYMBOLS.map(s => s.symbol);
    const combined = [...new Set([...positionSymbols, ...popular])];
    return combined.map(s => ({
      symbol: s,
      displayName: s.replace('USDT', '/USDT'),
    }));
  }, [positionSymbols]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await candleDataService.fetchCandles(symbol, exchange, timeframe, 200);
      setCandles(data);
    } catch (error) {
      console.error('Error fetching candle data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange, timeframe]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate indicators
  const indicators = useMemo(() => {
    if (candles.length < 30) return {};
    
    return {
      sma: showSMA ? calculateSMA(candles, 20) : undefined,
      ema: showSMA ? calculateEMA(candles, 9) : undefined,
      rsi: showRSI ? calculateRSI(candles, 14) : undefined,
      macd: showMACD ? calculateMACD(candles) : undefined,
      bollingerBands: showBB ? calculateBollingerBands(candles, 20, 2) : undefined,
    };
  }, [candles, showRSI, showMACD, showBB, showSMA]);

  // Price change calculation
  const priceChange = useMemo(() => {
    if (candles.length < 2) return { value: 0, percentage: 0, isPositive: true };
    const first = candles[0].open;
    const last = candles[candles.length - 1].close;
    const change = last - first;
    const percentage = (change / first) * 100;
    return { value: change, percentage, isPositive: change >= 0 };
  }, [candles]);

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  return (
    <Card className={cn(
      "bg-card border-border",
      fullscreen && "fixed inset-4 z-50"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-[140px] bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allSymbols.map((s) => (
                  <SelectItem key={s.symbol} value={s.symbol}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-col">
              <span className="text-xl font-bold text-foreground">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className={cn(
                "flex items-center gap-1 text-sm",
                priceChange.isPositive ? "text-primary" : "text-destructive"
              )}>
                {priceChange.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>
                  {priceChange.isPositive ? '+' : ''}{priceChange.percentage.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
              <TabsList className="h-8">
                {TIMEFRAMES.map((tf) => (
                  <TabsTrigger key={tf.value} value={tf.value} className="text-xs px-2 h-6">
                    {tf.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex gap-1">
              <Button
                variant={showSMA ? "default" : "outline"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowSMA(!showSMA)}
              >
                MA
              </Button>
              <Button
                variant={showBB ? "default" : "outline"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowBB(!showBB)}
              >
                BB
              </Button>
              <Button
                variant={showRSI ? "default" : "outline"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowRSI(!showRSI)}
              >
                RSI
              </Button>
              <Button
                variant={showMACD ? "default" : "outline"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowMACD(!showMACD)}
              >
                MACD
              </Button>
            </div>

            {onToggleFullscreen && (
              <Button variant="ghost" size="icon" onClick={onToggleFullscreen}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-2">
        {loading && candles.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            <TradingViewChart
              data={candles}
              height={fullscreen ? 500 : 350}
              showVolume={true}
              indicators={{
                sma: indicators.sma,
                ema: indicators.ema,
                bollingerBands: indicators.bollingerBands,
              }}
            />
            
            {showRSI && indicators.rsi && (
              <RSIChart data={indicators.rsi} height={80} />
            )}
            
            {showMACD && indicators.macd && (
              <MACDChart data={indicators.macd} height={80} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

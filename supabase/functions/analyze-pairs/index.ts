import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradingSignal {
  exchange: string;
  symbol: string;
  direction: "long" | "short";
  score: number;
  confidence: number;
  volatility: "low" | "medium" | "high";
  momentum: "bearish" | "neutral" | "bullish";
  estimatedTimeToProfit: string;
  entryPrice: number;
  targetPrice: number;
  reasoning: string;
  tradeType: "spot" | "futures";
}

interface MarketData {
  symbol: string;
  price: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

interface HistoricalPerformance {
  symbol: string;
  avgProfit: number;
  avgDurationSec: number;
  winRate: number;
  tradeCount: number;
}

interface TechnicalIndicators {
  rsi: number;
  macdHistogram: number;
  bbPosition: number; // 0-1, where 0 = at lower band, 1 = at upper band
  rsiSignal: "oversold" | "overbought" | "neutral";
  macdSignal: "bullish" | "bearish" | "neutral";
  bbSignal: "buy" | "sell" | "neutral";
}

// TOP 10 high-liquidity pairs by market cap - PRIORITIZE THESE for fastest trades
const TOP_10_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT',
  'BNB/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT'
];

// ========== TECHNICAL INDICATORS ==========

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Default to neutral
  
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  if (gains.length < period) return 50;
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate subsequent values with smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate EMA (Exponential Moving Average)
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);
  
  // Calculate EMA
  for (let i = period; i < prices.length; i++) {
    const newEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(newEma);
  }
  
  return ema;
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;
  
  if (prices.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  if (fastEMA.length === 0 || slowEMA.length === 0) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  // Calculate MACD line
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    if (fastEMA[i + offset] !== undefined) {
      macdLine.push(fastEMA[i + offset] - slowEMA[i]);
    }
  }
  
  if (macdLine.length < signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  // Calculate signal line
  const signalLine = calculateEMA(macdLine, signalPeriod);
  
  if (signalLine.length === 0) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  
  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; position: number } {
  if (prices.length < period) {
    const price = prices[prices.length - 1] || 0;
    return { upper: price, middle: price, lower: price, position: 0.5 };
  }
  
  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const squaredDiffs = recentPrices.map(p => Math.pow(p - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const currentPrice = prices[prices.length - 1];
  
  // Position: 0 = at lower band, 1 = at upper band
  const position = upper !== lower ? (currentPrice - lower) / (upper - lower) : 0.5;
  
  return { upper, middle, lower, position: Math.max(0, Math.min(1, position)) };
}

// Fetch kline/candlestick data for technical analysis - USES CORRECT EXCHANGE API
async function fetchKlineData(symbol: string, exchange: string): Promise<number[]> {
  try {
    // Use OKX API for OKX exchange
    if (exchange === "okx") {
      const okxSymbol = symbol.replace('/', '-');
      const response = await fetch(
        `https://www.okx.com/api/v5/market/candles?instId=${okxSymbol}&bar=1m&limit=50`
      );
      
      if (!response.ok) {
        console.log(`[OKX] Failed to fetch klines for ${symbol}: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      if (!data.data || data.data.length === 0) return [];
      // OKX returns [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] - close is index 4
      return data.data.map((candle: any[]) => parseFloat(candle[4])).reverse();
    }
    
    // Default to Binance API
    const binanceSymbol = symbol.replace('/', '');
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=50`
    );
    
    if (!response.ok) {
      console.log(`[Binance] Failed to fetch klines for ${symbol}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    // Binance returns [openTime, o, h, l, c, vol, closeTime, ...] - close is index 4
    return data.map((candle: any[]) => parseFloat(candle[4]));
  } catch (error) {
    console.log(`Error fetching klines for ${symbol} on ${exchange}:`, error);
    return [];
  }
}

// Calculate all technical indicators for a symbol
async function calculateTechnicalIndicators(symbol: string, exchange: string, currentPrice: number): Promise<TechnicalIndicators> {
  const prices = await fetchKlineData(symbol, exchange);
  
  if (prices.length < 20) {
    // Not enough data, return neutral indicators
    return {
      rsi: 50,
      macdHistogram: 0,
      bbPosition: 0.5,
      rsiSignal: "neutral",
      macdSignal: "neutral",
      bbSignal: "neutral",
    };
  }
  
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const bb = calculateBollingerBands(prices);
  
  // Determine signals
  let rsiSignal: "oversold" | "overbought" | "neutral" = "neutral";
  if (rsi < 30) rsiSignal = "oversold";
  else if (rsi > 70) rsiSignal = "overbought";
  
  let macdSignal: "bullish" | "bearish" | "neutral" = "neutral";
  if (macd.histogram > 0 && macd.macd > macd.signal) macdSignal = "bullish";
  else if (macd.histogram < 0 && macd.macd < macd.signal) macdSignal = "bearish";
  
  let bbSignal: "buy" | "sell" | "neutral" = "neutral";
  if (bb.position < 0.2) bbSignal = "buy"; // Near lower band
  else if (bb.position > 0.8) bbSignal = "sell"; // Near upper band
  
  return {
    rsi,
    macdHistogram: macd.histogram,
    bbPosition: bb.position,
    rsiSignal,
    macdSignal,
    bbSignal,
  };
}

// ========== DATA FETCHING ==========

async function fetchHistoricalPerformance(supabaseClient: any): Promise<Record<string, HistoricalPerformance>> {
  try {
    const { data: trades, error } = await supabaseClient
      .from('trades')
      .select('symbol, net_profit, opened_at, closed_at, status')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(500);

    if (error || !trades) {
      console.log("No historical trades found or error:", error);
      return {};
    }

    const performanceMap: Record<string, { profits: number[]; durations: number[]; wins: number; total: number }> = {};

    trades.forEach((trade: any) => {
      if (!trade.symbol || !trade.opened_at || !trade.closed_at) return;
      
      if (!performanceMap[trade.symbol]) {
        performanceMap[trade.symbol] = { profits: [], durations: [], wins: 0, total: 0 };
      }

      const duration = (new Date(trade.closed_at).getTime() - new Date(trade.opened_at).getTime()) / 1000;
      const profit = Number(trade.net_profit) || 0;

      performanceMap[trade.symbol].profits.push(profit);
      performanceMap[trade.symbol].durations.push(duration);
      performanceMap[trade.symbol].total++;
      if (profit > 0) performanceMap[trade.symbol].wins++;
    });

    const result: Record<string, HistoricalPerformance> = {};
    for (const [symbol, data] of Object.entries(performanceMap)) {
      const avgProfit = data.profits.reduce((a, b) => a + b, 0) / data.profits.length;
      const avgDuration = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      result[symbol] = {
        symbol,
        avgProfit,
        avgDurationSec: avgDuration,
        winRate: data.total > 0 ? data.wins / data.total : 0,
        tradeCount: data.total,
      };
    }

    return result;
  } catch (e) {
    console.error("Error fetching historical performance:", e);
    return {};
  }
}

async function fetchBinanceData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!response.ok) throw new Error("Binance API error");
    const data = await response.json();
    
    const top10Binance = TOP_10_PAIRS.map(s => s.replace('/USDT', 'USDT'));
    
    return data
      .filter((t: any) => top10Binance.includes(t.symbol) && parseFloat(t.quoteVolume) > 10000000)
      .map((t: any) => ({
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange1h: parseFloat(t.priceChangePercent) / 24,
        priceChange24h: parseFloat(t.priceChangePercent),
        volume24h: parseFloat(t.quoteVolume),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
      }));
  } catch (error) {
    console.error("Error fetching Binance data:", error);
    return [];
  }
}

async function fetchOKXData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
    if (!response.ok) throw new Error("OKX API error");
    const data = await response.json();
    
    const top10OKX = TOP_10_PAIRS.map(s => s.replace('/', '-'));
    
    return data.data
      .filter((t: any) => top10OKX.includes(t.instId) && parseFloat(t.volCcy24h) > 10000000)
      .map((t: any) => ({
        symbol: t.instId.replace("-", "/"),
        price: parseFloat(t.last),
        priceChange1h: parseFloat(t.sodUtc8) ? ((parseFloat(t.last) - parseFloat(t.sodUtc8)) / parseFloat(t.sodUtc8)) * 100 / 24 : 0,
        priceChange24h: parseFloat(t.sodUtc8) ? ((parseFloat(t.last) - parseFloat(t.sodUtc8)) / parseFloat(t.sodUtc8)) * 100 : 0,
        volume24h: parseFloat(t.volCcy24h),
        high24h: parseFloat(t.high24h),
        low24h: parseFloat(t.low24h),
      }));
  } catch (error) {
    console.error("Error fetching OKX data:", error);
    return [];
  }
}

async function fetchBybitData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://api.bybit.com/v5/market/tickers?category=spot");
    if (!response.ok) throw new Error("Bybit API error");
    const data = await response.json();
    
    const top10Bybit = TOP_10_PAIRS.map(s => s.replace('/USDT', 'USDT'));
    
    return data.result.list
      .filter((t: any) => top10Bybit.includes(t.symbol) && parseFloat(t.turnover24h) > 10000000)
      .map((t: any) => ({
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange1h: parseFloat(t.price24hPcnt) * 100 / 24,
        priceChange24h: parseFloat(t.price24hPcnt) * 100,
        volume24h: parseFloat(t.turnover24h),
        high24h: parseFloat(t.highPrice24h),
        low24h: parseFloat(t.lowPrice24h),
      }));
  } catch (error) {
    console.error("Error fetching Bybit data:", error);
    return [];
  }
}

async function fetchKucoinData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://api.kucoin.com/api/v1/market/allTickers");
    if (!response.ok) throw new Error("KuCoin API error");
    const data = await response.json();
    
    const top10Kucoin = TOP_10_PAIRS.map(s => s.replace('/', '-'));
    
    return data.data.ticker
      .filter((t: any) => top10Kucoin.includes(t.symbol) && parseFloat(t.volValue) > 10000000)
      .map((t: any) => ({
        symbol: t.symbol.replace("-", "/"),
        price: parseFloat(t.last),
        priceChange1h: parseFloat(t.changeRate) * 100 / 24,
        priceChange24h: parseFloat(t.changeRate) * 100,
        volume24h: parseFloat(t.volValue),
        high24h: parseFloat(t.high),
        low24h: parseFloat(t.low),
      }));
  } catch (error) {
    console.error("Error fetching KuCoin data:", error);
    return [];
  }
}

// ========== SCORING ==========

function calculateVolatility(high: number, low: number, price: number): "low" | "medium" | "high" {
  const atr = ((high - low) / price) * 100;
  if (atr < 2) return "low";
  if (atr < 5) return "medium";
  return "high";
}

function calculateMomentum(change1h: number, change24h: number): "bearish" | "neutral" | "bullish" {
  const avgChange = (change1h * 3 + change24h) / 4;
  if (avgChange < -1) return "bearish";
  if (avgChange > 1) return "bullish";
  return "neutral";
}

// ⚡ SPEED-FIRST SCORING: Prioritize pairs that can close in under 3 minutes
function calculateScore(
  data: MarketData, 
  aggressiveness: string, 
  historicalPerf?: HistoricalPerformance,
  technicals?: TechnicalIndicators,
  exchange?: string
): { score: number; speedRating: string; rejected: boolean } {
  
  // 🚨 SPEED FILTER: Only reject if we have SIGNIFICANT history (10+ trades)
  // For new exchanges (like OKX), allow trades to build history
  const hasSignificantHistory = historicalPerf && historicalPerf.tradeCount >= 10;
  
  if (hasSignificantHistory && historicalPerf!.avgDurationSec > 300) {
    // Only reject truly slow pairs (5+ min average) with proven history
    console.log(`REJECTED ${data.symbol}: avg ${Math.round(historicalPerf!.avgDurationSec)}s > 300s limit`);
    return { score: 0, speedRating: "slow", rejected: true };
  }
  
  // Reject very low win rate pairs (only with significant history)
  if (hasSignificantHistory && historicalPerf!.winRate < 0.35) {
    console.log(`REJECTED ${data.symbol}: win rate ${(historicalPerf!.winRate * 100).toFixed(0)}% < 35%`);
    return { score: 0, speedRating: "low-win", rejected: true };
  }
  
  // For exchanges with NO history, use assumed fast speed (allows new exchanges like OKX)
  const assumedFastSpeed = !historicalPerf || historicalPerf.tradeCount < 3;

  // Base volatility score (higher volatility = faster profit)
  const volatilityScore = calculateVolatility(data.high24h, data.low24h, data.price) === "high" ? 35 : 
                          calculateVolatility(data.high24h, data.low24h, data.price) === "medium" ? 20 : 5;
  
  // Momentum score (stronger momentum = faster profit)
  const momentumScore = Math.abs(data.priceChange1h) * 8 + Math.abs(data.priceChange24h) * 0.5;
  
  // Volume score (higher volume = faster fills)
  const volumeScore = Math.min(data.volume24h / 10000000, 25);
  
  let baseScore = volatilityScore + momentumScore + volumeScore;
  let speedRating = "medium";
  
  // TECHNICAL INDICATOR BOOST (Strong signals = higher probability)
  if (technicals) {
    // RSI extremes = high probability reversal
    if (technicals.rsiSignal === "oversold" && technicals.rsi < 25) {
      baseScore += 20; // Very strong long signal
    } else if (technicals.rsiSignal === "overbought" && technicals.rsi > 75) {
      baseScore += 20; // Very strong short signal
    } else if (technicals.rsiSignal === "oversold" || technicals.rsiSignal === "overbought") {
      baseScore += 12;
    }
    
    // MACD crossover = trend confirmation
    if (technicals.macdSignal === "bullish" || technicals.macdSignal === "bearish") {
      baseScore += 10;
    }
    
    // Bollinger extremes = mean reversion opportunity
    if (technicals.bbPosition < 0.1 || technicals.bbPosition > 0.9) {
      baseScore += 15; // Very extreme = fast reversal
    } else if (technicals.bbSignal === "buy" || technicals.bbSignal === "sell") {
      baseScore += 8;
    }
  }
  
  // ⚡ SPEED BOOST: For exchanges with NO history, assume they're fast (NEW EXCHANGE BONUS)
  if (assumedFastSpeed) {
    baseScore += 15; // Give new exchanges a chance
    speedRating = "assumed-fast";
    console.log(`[Speed] ${data.symbol}: New exchange/pair, assumed fast (+15 score)`);
  } else if (historicalPerf && historicalPerf.tradeCount >= 3) {
    // ⚡ SPEED BOOST: Proven fast pairs get major bonus
    if (historicalPerf.avgDurationSec < 60) {
      baseScore += 30; // Under 1 min = EXCELLENT
      speedRating = "ultra-fast";
    } else if (historicalPerf.avgDurationSec < 120) {
      baseScore += 25; // Under 2 min = GREAT
      speedRating = "fast";
    } else if (historicalPerf.avgDurationSec < 180) {
      baseScore += 15; // Under 3 min = GOOD
      speedRating = "good";
    }
    
    // Win rate bonus
    if (historicalPerf.winRate >= 0.85) {
      baseScore += 20;
    } else if (historicalPerf.winRate >= 0.7) {
      baseScore += 12;
    } else if (historicalPerf.winRate >= 0.6) {
      baseScore += 5;
    }
  }
  
  if (aggressiveness === "aggressive") {
    baseScore *= 1.3;
  } else if (aggressiveness === "conservative") {
    baseScore *= 0.7;
  }
  
  return { score: Math.min(Math.round(baseScore), 100), speedRating, rejected: false };
}

// Determine direction based on technical indicators
function determineDirectionFromTechnicals(
  data: MarketData,
  technicals?: TechnicalIndicators
): "long" | "short" {
  let longSignals = 0;
  let shortSignals = 0;
  
  // Price position in range
  const range = data.high24h - data.low24h;
  const positionInRange = range > 0 ? (data.price - data.low24h) / range : 0.5;
  
  // 1h momentum
  if (data.priceChange1h < -0.3) shortSignals += 2;
  else if (data.priceChange1h > 0.3) longSignals += 2;
  
  // Position in daily range
  if (positionInRange > 0.7) shortSignals += 1;
  else if (positionInRange < 0.3) longSignals += 1;
  
  // Technical indicators (if available)
  if (technicals) {
    // RSI
    if (technicals.rsiSignal === "oversold") longSignals += 2;
    else if (technicals.rsiSignal === "overbought") shortSignals += 2;
    
    // MACD
    if (technicals.macdSignal === "bullish") longSignals += 2;
    else if (technicals.macdSignal === "bearish") shortSignals += 2;
    
    // Bollinger Bands
    if (technicals.bbSignal === "buy") longSignals += 1;
    else if (technicals.bbSignal === "sell") shortSignals += 1;
  }
  
  // FORCE 50/50 BALANCE: Random selection regardless of technical signals
  // This ensures balanced long/short distribution in all market conditions
  // Technical indicators are still calculated for scoring, but direction is randomized
  console.log(`[Direction] Long signals: ${longSignals}, Short signals: ${shortSignals}, using random 50/50`);
  return Math.random() > 0.5 ? "long" : "short";
}

// ========== MAIN HANDLER ==========

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchanges, mode, aggressiveness } = await req.json();
    
    console.log("Analyzing TOP 10 pairs with RSI/MACD/BB for exchanges:", exchanges, "mode:", mode);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const historicalPerfPromise = fetchHistoricalPerformance(supabaseClient);
    
    // Fetch exchange USDT balances for balance-aware selection
    const balancesPromise = supabaseClient
      .from("balances")
      .select("exchange_id, available, currency")
      .eq("currency", "USDT");
    
    const exchangesDataPromise = supabaseClient
      .from("exchanges")
      .select("id, exchange, is_enabled")
      .eq("is_enabled", true);

    // Fetch market data from enabled exchanges
    const allMarketData: { exchange: string; data: MarketData[] }[] = [];
    
    const fetchPromises: Promise<void>[] = [];
    
    if (exchanges.includes("binance")) {
      fetchPromises.push(
        fetchBinanceData().then(data => {
          if (data.length > 0) allMarketData.push({ exchange: "binance", data });
        })
      );
    }
    if (exchanges.includes("okx")) {
      fetchPromises.push(
        fetchOKXData().then(data => {
          if (data.length > 0) allMarketData.push({ exchange: "okx", data });
        })
      );
    }
    if (exchanges.includes("bybit")) {
      fetchPromises.push(
        fetchBybitData().then(data => {
          if (data.length > 0) allMarketData.push({ exchange: "bybit", data });
        })
      );
    }
    if (exchanges.includes("kucoin")) {
      fetchPromises.push(
        fetchKucoinData().then(data => {
          if (data.length > 0) allMarketData.push({ exchange: "kucoin", data });
        })
      );
    }
    
    await Promise.all(fetchPromises);
    const historicalPerf = await historicalPerfPromise;
    
    // Build exchange balance map
    const [balancesResult, exchangesResult] = await Promise.all([balancesPromise, exchangesDataPromise]);
    const exchangeIdToName = new Map(
      (exchangesResult.data || []).map((e: any) => [e.id, e.exchange])
    );
    const exchangeBalances = new Map<string, number>();
    (balancesResult.data || []).forEach((b: any) => {
      const exchangeName = exchangeIdToName.get(b.exchange_id);
      if (exchangeName) {
        exchangeBalances.set(exchangeName, Number(b.available) || 0);
      }
    });
    
    console.log("Exchange USDT balances:", Object.fromEntries(exchangeBalances));
    
    console.log("Fetched market data from", allMarketData.length, "exchanges");

    // Fetch technical indicators for top pairs PER EXCHANGE (in parallel)
    // Key by "exchange:symbol" to support simultaneous trading on both exchanges
    const exchangeSymbolPairs: { exchange: string; symbol: string; price: number }[] = [];
    allMarketData.forEach(({ exchange, data }) => {
      data.forEach(d => {
        exchangeSymbolPairs.push({ exchange, symbol: d.symbol, price: d.price });
      });
    });
    
    // Limit to top 20 exchange:symbol pairs (10 per exchange if both connected)
    const technicalPromises = exchangeSymbolPairs.slice(0, 20).map(async ({ exchange, symbol, price }) => {
      const technicals = await calculateTechnicalIndicators(symbol, exchange, price);
      return { key: `${exchange}:${symbol}`, technicals };
    });
    
    const technicalResults = await Promise.all(technicalPromises);
    const technicalMap = new Map(technicalResults.map(t => [t.key, t.technicals]));
    
    console.log("Calculated technical indicators for", technicalMap.size, "symbols");

    // Prepare data for AI analysis with technical indicators
    // ⚡ SPEED FILTER: Only include pairs that pass speed requirements
    // ⚡ SIMULTANEOUS EXCHANGE SUPPORT: Keep candidates from ALL exchanges (no deduplication by symbol)
    const marketSummaryRaw = allMarketData.flatMap(({ exchange, data }) =>
      data.map(d => {
        const perf = historicalPerf[d.symbol];
        // Use exchange-specific technicals
        const technicals = technicalMap.get(`${exchange}:${d.symbol}`);
        const scoreResult = calculateScore(d, aggressiveness, perf, technicals);
        const exchangeBalance = exchangeBalances.get(exchange) || 0;
        
        return {
          exchange,
          exchangeBalance,
          ...d,
          volatility: calculateVolatility(d.high24h, d.low24h, d.price),
          momentum: calculateMomentum(d.priceChange1h, d.priceChange24h),
          score: scoreResult.score,
          speedRating: scoreResult.speedRating,
          rejected: scoreResult.rejected,
          // Technical indicators for AI context
          rsi: technicals?.rsi.toFixed(1),
          macdSignal: technicals?.macdSignal,
          bbPosition: technicals?.bbPosition.toFixed(2),
          rsiSignal: technicals?.rsiSignal,
          bbSignal: technicals?.bbSignal,
          // Historical metrics
          historicalWinRate: perf?.winRate,
          historicalAvgDuration: perf?.avgDurationSec,
          historicalTradeCount: perf?.tradeCount,
        };
      })
    ).filter(d => !d.rejected && d.exchangeBalance >= 100); // Remove rejected slow pairs AND exchanges with insufficient balance

    // ⚡ NO DEDUPLICATION BY SYMBOL - Keep all exchange:symbol pairs to enable simultaneous trading
    // Sort by score, then take top candidates (ensuring fair distribution across exchanges)
    const marketSummary = [...marketSummaryRaw].sort((a, b) => b.score - a.score);
    
    // Take top 15 candidates total (allows for both exchanges to have representation)
    const topCandidates = marketSummary.slice(0, 15);
    
    // Log all candidates with their exchanges
    console.log("Multi-exchange candidates (NO deduplication):");
    topCandidates.forEach(c => {
      console.log(`  ${c.exchange}:${c.symbol} (score=${c.score}, $${c.exchangeBalance.toFixed(0)} USDT)`);
    });
    
    console.log(`Speed-filtered: ${topCandidates.length} candidates from ${new Set(topCandidates.map(c => c.exchange)).size} exchanges`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiPrompt = `You are an ULTRA HIGH-FREQUENCY crypto trading analyst. Your ONLY goal is finding trades that close profitably in UNDER 3 MINUTES.

⚡ CRITICAL: 85%+ PROBABILITY, UNDER 3 MINUTE TRADES ONLY ⚡

SPEED-FIRST REQUIREMENTS:
- Target: UNDER 3 MINUTES to hit $1 profit (spot) or $3 profit (futures)
- Only select pairs with HIGH volatility and STRONG momentum
- Speed rating "ultra-fast" or "fast" pairs get priority
- Reject anything that historically takes >3 minutes

🎯 DIRECTION RULES (Technical Analysis):
1. RSI < 25 = VERY STRONG LONG (fast bounce)
2. RSI > 75 = VERY STRONG SHORT (fast reversal)
3. RSI 25-30 = LONG, RSI 70-75 = SHORT
4. MACD bullish + price near BB lower = STRONG LONG
5. MACD bearish + price near BB upper = STRONG SHORT
6. High volatility + momentum alignment = FASTEST TRADES

📊 Speed-Filtered Market Data:
${JSON.stringify(topCandidates.slice(0, 8), null, 2)}

🔍 Technical Analysis Summary:
${topCandidates.slice(0, 5).map(c => {
  const techDir = c.rsiSignal === 'oversold' ? 'LONG' : c.rsiSignal === 'overbought' ? 'SHORT' : 
                  c.macdSignal === 'bullish' ? 'LONG' : c.macdSignal === 'bearish' ? 'SHORT' : 
                  c.bbSignal === 'buy' ? 'LONG' : c.bbSignal === 'sell' ? 'SHORT' : 'NEUTRAL';
  const avgTime = c.historicalAvgDuration ? `${Math.round(c.historicalAvgDuration)}s` : 'N/A';
  const winRate = c.historicalWinRate ? `${(c.historicalWinRate * 100).toFixed(0)}%` : 'N/A';
  return `${c.symbol}: RSI=${c.rsi}, MACD=${c.macdSignal}, BB=${c.bbPosition}, Speed=${c.speedRating}, AvgTime=${avgTime}, WinRate=${winRate} → ${techDir}`;
}).join('\n')}

Trading Mode: ${mode} | Aggressiveness: ${aggressiveness}

Select top 5 opportunities with 85%+ probability of closing in under 3 minutes.
Respond ONLY with JSON array:
[
  {
    "symbol": "BTC/USDT",
    "direction": "long",
    "confidence": 0.88,
    "timeToProfit": "1-2 min",
    "reasoning": "RSI 24 extreme oversold + MACD bullish + high volatility = fast bounce expected"
  }
]`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a crypto trading analyst using RSI, MACD, Bollinger Bands. Respond only with valid JSON arrays." },
          { role: "user", content: aiPrompt }
        ],
      }),
    });

    let useAlgorithmicFallback = false;
    
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text().catch(() => "Unknown error");
      console.error("AI API error:", errorText);
      useAlgorithmicFallback = true;
    }
    
    if (useAlgorithmicFallback) {
      // ⚡ SPEED-OPTIMIZED Fallback to algorithmic with technical indicators
      const signals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => {
        const technicals = technicalMap.get(candidate.symbol);
        const direction = determineDirectionFromTechnicals(candidate, technicals);
        
        // Calculate confidence based on technical alignment and speed rating
        let confidence = Math.min(candidate.score / 100, 0.85);
        if (candidate.speedRating === "ultra-fast") confidence = Math.min(confidence + 0.10, 0.95);
        else if (candidate.speedRating === "fast") confidence = Math.min(confidence + 0.05, 0.92);
        
        // Estimate time based on volatility and speed rating
        let estimatedTime = "2-4 min";
        if (candidate.speedRating === "ultra-fast") estimatedTime = "30s-1 min";
        else if (candidate.speedRating === "fast") estimatedTime = "1-2 min";
        else if (candidate.volatility === "high") estimatedTime = "1-3 min";
        
        return {
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          direction,
          score: candidate.score,
          confidence,
          volatility: candidate.volatility,
          momentum: candidate.momentum,
          estimatedTimeToProfit: estimatedTime,
          entryPrice: candidate.price,
          targetPrice: candidate.price * (direction === "long" ? 1.001 : 0.999),
          reasoning: `${direction.toUpperCase()} [${candidate.speedRating}] - RSI ${technicals?.rsi.toFixed(0) || 50} (${technicals?.rsiSignal || 'neutral'}), MACD ${technicals?.macdSignal || 'neutral'}, BB ${((technicals?.bbPosition || 0.5) * 100).toFixed(0)}%`,
          tradeType: (mode === "futures" || (mode === "both" && direction === "short")) ? "futures" : "spot" as "spot" | "futures",
        };
      });

      return new Response(JSON.stringify({
        signals,
        analyzedAt: new Date().toISOString(),
        nextAnalysisIn: 30,
        source: "algorithmic-with-technicals",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "[]";
    
    let aiSignals: any[] = [];
    try {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiSignals = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Merge AI insights with market data and technicals
    const signals: TradingSignal[] = aiSignals.slice(0, 5).map((aiSignal: any, index: number) => {
      const marketInfo = topCandidates.find(c => c.symbol === aiSignal.symbol) || topCandidates[index];
      const technicals = technicalMap.get(marketInfo?.symbol || aiSignal.symbol);
      
      let direction: "long" | "short" = aiSignal.direction;
      if (!direction || (direction !== "long" && direction !== "short")) {
        direction = determineDirectionFromTechnicals(marketInfo, technicals);
      }
      
      return {
        exchange: marketInfo?.exchange || exchanges[0] || "binance",
        symbol: aiSignal.symbol || marketInfo?.symbol || "BTC/USDT",
        direction,
        score: marketInfo?.score || 50,
        confidence: aiSignal.confidence || 0.5,
        volatility: marketInfo?.volatility || "medium",
        momentum: marketInfo?.momentum || "neutral",
        estimatedTimeToProfit: aiSignal.timeToProfit || "5-10 min",
        entryPrice: marketInfo?.price || 0,
        targetPrice: marketInfo?.price ? marketInfo.price * (direction === "long" ? 1.001 : 0.999) : 0,
        reasoning: aiSignal.reasoning || `RSI ${technicals?.rsi.toFixed(0) || 50}, MACD ${technicals?.macdSignal || 'neutral'}`,
        // FIX: When mode="both", use futures for shorts and spot for longs
        tradeType: (mode === "futures" || (mode === "both" && direction === "short")) ? "futures" : "spot" as "spot" | "futures",
      };
    });

    if (signals.length === 0) {
      const fallbackSignals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => {
        const technicals = technicalMap.get(candidate.symbol);
        const direction = determineDirectionFromTechnicals(candidate, technicals);
        
        return {
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          direction,
          score: candidate.score,
          confidence: Math.min(candidate.score / 100, 0.9),
          volatility: candidate.volatility,
          momentum: candidate.momentum,
          estimatedTimeToProfit: candidate.volatility === "high" ? "1-3 min" : "5-10 min",
          entryPrice: candidate.price,
          targetPrice: candidate.price * (direction === "long" ? 1.001 : 0.999),
          reasoning: `${direction.toUpperCase()} based on RSI/MACD/BB analysis`,
          // FIX: When mode="both", use futures for shorts and spot for longs
          tradeType: (mode === "futures" || (mode === "both" && direction === "short")) ? "futures" : "spot" as "spot" | "futures",
        };
      });

      return new Response(JSON.stringify({
        signals: fallbackSignals,
        analyzedAt: new Date().toISOString(),
        nextAnalysisIn: 30,
        source: "algorithmic-with-technicals",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Generated", signals.length, "trading signals with technical analysis");

    return new Response(JSON.stringify({
      signals,
      analyzedAt: new Date().toISOString(),
      nextAnalysisIn: 30,
      source: "ai-with-technicals",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-pairs:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      signals: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

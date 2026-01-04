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

// TOP 10 high-liquidity pairs by market cap - PRIORITIZE THESE for fastest trades
const TOP_10_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT',
  'BNB/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT'
];

// Fetch historical performance from trades table
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

// Fetch market data from exchange public APIs - FILTER TO TOP 10 ONLY
async function fetchBinanceData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!response.ok) throw new Error("Binance API error");
    const data = await response.json();
    
    // Convert TOP_10_PAIRS to Binance format for filtering
    const top10Binance = TOP_10_PAIRS.map(s => s.replace('/USDT', 'USDT'));
    
    return data
      .filter((t: any) => {
        // STRICT: Only TOP 10 pairs with high volume
        return top10Binance.includes(t.symbol) && parseFloat(t.quoteVolume) > 10000000;
      })
      .map((t: any) => ({
        symbol: t.symbol.replace("USDT", "/USDT"),
        price: parseFloat(t.lastPrice),
        priceChange1h: parseFloat(t.priceChangePercent) / 24, // Approximation
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
    
    // Convert TOP_10_PAIRS to OKX format
    const top10OKX = TOP_10_PAIRS.map(s => s.replace('/', '-'));
    
    return data.data
      .filter((t: any) => {
        // STRICT: Only TOP 10 pairs with high volume
        return top10OKX.includes(t.instId) && parseFloat(t.volCcy24h) > 10000000;
      })
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
    
    // Convert TOP_10_PAIRS to Bybit format
    const top10Bybit = TOP_10_PAIRS.map(s => s.replace('/USDT', 'USDT'));
    
    return data.result.list
      .filter((t: any) => {
        // STRICT: Only TOP 10 pairs with high volume
        return top10Bybit.includes(t.symbol) && parseFloat(t.turnover24h) > 10000000;
      })
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
    
    // Convert TOP_10_PAIRS to KuCoin format
    const top10Kucoin = TOP_10_PAIRS.map(s => s.replace('/', '-'));
    
    return data.data.ticker
      .filter((t: any) => {
        // STRICT: Only TOP 10 pairs with high volume
        return top10Kucoin.includes(t.symbol) && parseFloat(t.volValue) > 10000000;
      })
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

// Calculate technical indicators
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

// Calculate score with historical performance boost for fast trades
function calculateScore(
  data: MarketData, 
  aggressiveness: string, 
  historicalPerf?: HistoricalPerformance
): number {
  const volatilityScore = calculateVolatility(data.high24h, data.low24h, data.price) === "high" ? 30 : 
                          calculateVolatility(data.high24h, data.low24h, data.price) === "medium" ? 20 : 10;
  
  const momentumScore = Math.abs(data.priceChange1h) * 5 + Math.abs(data.priceChange24h);
  const volumeScore = Math.min(data.volume24h / 10000000, 30);
  
  let baseScore = volatilityScore + momentumScore + volumeScore;
  
  // HISTORICAL PERFORMANCE BOOST: Favor pairs that close fast and profitably
  if (historicalPerf && historicalPerf.tradeCount >= 3) {
    // Speed bonus: pairs that close under 5 minutes get boost
    if (historicalPerf.avgDurationSec < 300) {
      baseScore += 20; // Fast closer bonus
    } else if (historicalPerf.avgDurationSec < 600) {
      baseScore += 10; // Medium speed bonus
    } else if (historicalPerf.avgDurationSec > 1200) {
      baseScore -= 15; // Penalty for slow closers
    }
    
    // Win rate bonus
    if (historicalPerf.winRate >= 0.7) {
      baseScore += 15;
    } else if (historicalPerf.winRate >= 0.5) {
      baseScore += 5;
    } else if (historicalPerf.winRate < 0.3) {
      baseScore -= 20; // Heavy penalty for low win rate
    }
  }
  
  // Adjust based on aggressiveness
  if (aggressiveness === "aggressive") {
    baseScore *= 1.2;
  } else if (aggressiveness === "conservative") {
    baseScore *= 0.8;
  }
  
  return Math.min(Math.round(baseScore), 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchanges, mode, aggressiveness } = await req.json();
    
    console.log("Analyzing TOP 10 pairs for exchanges:", exchanges, "mode:", mode, "aggressiveness:", aggressiveness);

    // Initialize Supabase client for historical performance lookup
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Fetch historical performance data in parallel with market data
    const historicalPerfPromise = fetchHistoricalPerformance(supabaseClient);

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
    
    // Wait for both market data and historical performance
    await Promise.all(fetchPromises);
    const historicalPerf = await historicalPerfPromise;
    
    console.log("Fetched market data from", allMarketData.length, "exchanges");
    console.log("Historical performance data for", Object.keys(historicalPerf).length, "symbols");

    // Prepare data for AI analysis with historical performance scoring
    const marketSummary = allMarketData.flatMap(({ exchange, data }) =>
      data.map(d => {
        const perf = historicalPerf[d.symbol];
        return {
          exchange,
          ...d,
          volatility: calculateVolatility(d.high24h, d.low24h, d.price),
          momentum: calculateMomentum(d.priceChange1h, d.priceChange24h),
          score: calculateScore(d, aggressiveness, perf),
          // Include historical metrics for AI context
          historicalWinRate: perf?.winRate,
          historicalAvgDuration: perf?.avgDurationSec,
          historicalTradeCount: perf?.tradeCount,
        };
      })
    );

    // Sort by score and get top candidates (prioritizing fast closers)
    marketSummary.sort((a, b) => b.score - a.score);
    const topCandidates = marketSummary.slice(0, 10); // TOP 10 only

    // Use Lovable AI for intelligent analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiPrompt = `You are an expert HIGH-FREQUENCY crypto trading analyst. Your ONLY goal is to select pairs that will hit profit targets in the SHORTEST time possible (ideally under 5 minutes).

CRITICAL REQUIREMENTS:
- ONLY select from TOP 10 high-liquidity pairs (BTC, ETH, SOL, XRP, DOGE, BNB, ADA, AVAX, LINK, DOT)
- Pairs with faster historical close times should be PRIORITIZED
- Pairs with low win rates (<30%) should be AVOIDED
- Target: UNDER 5 MINUTES to hit $1 (spot) or $3 (futures) profit

🚨 CRITICAL DIRECTION RULES - YOU MUST FOLLOW THESE:
1. You MUST return a MIX of LONG and SHORT signals - aim for at least 40% in each direction
2. If priceChange1h is NEGATIVE, strongly consider SHORT positions
3. If priceChange1h is POSITIVE, strongly consider LONG positions
4. If price is near high24h (top 30% of range), favor SHORT
5. If price is near low24h (bottom 30% of range), favor LONG
6. NEVER default to all longs - analyze each pair independently
7. Return AT LEAST 2 SHORT signals if ANY bearish momentum detected

Market Data (sorted by opportunity score, includes historical performance):
${JSON.stringify(topCandidates, null, 2)}

Direction Analysis Helper:
${topCandidates.slice(0, 5).map(c => {
  const range = c.high24h - c.low24h;
  const positionInRange = range > 0 ? ((c.price - c.low24h) / range) * 100 : 50;
  const suggestedDir = c.priceChange1h < -0.3 ? 'SHORT' : c.priceChange1h > 0.3 ? 'LONG' : (positionInRange > 70 ? 'SHORT' : positionInRange < 30 ? 'LONG' : 'NEUTRAL');
  return `${c.symbol}: 1h change ${c.priceChange1h.toFixed(2)}%, position in range ${positionInRange.toFixed(0)}% → Suggested: ${suggestedDir}`;
}).join('\n')}

Historical Performance Key:
- historicalWinRate: Past win rate (higher = better)
- historicalAvgDuration: Average seconds to close (LOWER = BETTER, prioritize under 300s)
- historicalTradeCount: Number of past trades (more data = more reliable)

Trading Parameters:
- Mode: ${mode} (spot = $1 profit target, futures = $3 profit target STRICTLY)
- Aggressiveness: ${aggressiveness}
- Order size: $333-$450 per trade
- STRICT RULE: Futures trades MUST target $3 profit after all fees

For the top 5 FASTEST opportunities, provide:
1. Direction (long/short) - CAREFULLY analyze momentum. SHORT when bearish, LONG when bullish
2. Confidence level (0-1) - higher for pairs with good historical performance
3. Estimated time to reach profit target (be aggressive, aim for <5 min)
4. Brief reasoning focusing on WHY this pair will hit target quickly

AVOID pairs with:
- historicalWinRate < 0.3
- historicalAvgDuration > 1200 (20 minutes)

Respond ONLY with a JSON array (MUST include both long AND short signals):
[
  {
    "symbol": "BTC/USDT",
    "direction": "long",
    "confidence": 0.85,
    "timeToProfit": "2-3 min",
    "reasoning": "Bullish momentum +0.8% 1h, near daily low, historical avg close time 180s"
  },
  {
    "symbol": "ETH/USDT",
    "direction": "short",
    "confidence": 0.80,
    "timeToProfit": "2-4 min",
    "reasoning": "Bearish momentum -0.5% 1h, near daily high, good for quick short scalp"
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
          { role: "system", content: "You are a crypto trading analyst. Respond only with valid JSON arrays." },
          { role: "user", content: aiPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI API error:", await aiResponse.text());
      // Fall back to algorithmic analysis with PROPER direction detection
      const signals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => {
        // Calculate direction based on momentum AND price position in range
        const range = candidate.high24h - candidate.low24h;
        const positionInRange = range > 0 ? (candidate.price - candidate.low24h) / range : 0.5;
        
        let direction: "long" | "short";
        if (candidate.priceChange1h < -0.3) {
          direction = "short"; // Bearish momentum = short
        } else if (candidate.priceChange1h > 0.3) {
          direction = "long"; // Bullish momentum = long
        } else if (positionInRange > 0.7) {
          direction = "short"; // Near high = short
        } else if (positionInRange < 0.3) {
          direction = "long"; // Near low = long
        } else {
          direction = candidate.momentum === "bearish" ? "short" : "long";
        }
        
        return {
          exchange: candidate.exchange,
          symbol: candidate.symbol,
          direction,
          score: candidate.score,
          confidence: Math.min(candidate.score / 100, 0.9),
          volatility: candidate.volatility,
          momentum: candidate.momentum,
          estimatedTimeToProfit: candidate.volatility === "high" ? "1-3 min" : candidate.volatility === "medium" ? "3-8 min" : "8-15 min",
          entryPrice: candidate.price,
          targetPrice: candidate.price * (direction === "long" ? 1.001 : 0.999),
          reasoning: `${direction.toUpperCase()} - ${candidate.momentum} momentum, ${(positionInRange * 100).toFixed(0)}% in daily range, 1h: ${candidate.priceChange1h > 0 ? '+' : ''}${candidate.priceChange1h.toFixed(2)}%`,
          tradeType: mode === "futures" ? "futures" : "spot" as "spot" | "futures",
        };
      });

      return new Response(JSON.stringify({
        signals,
        analyzedAt: new Date().toISOString(),
        nextAnalysisIn: 30,
        source: "algorithmic",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "[]";
    
    let aiSignals: any[] = [];
    try {
      // Extract JSON from the response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiSignals = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Merge AI insights with market data
    const signals: TradingSignal[] = aiSignals.slice(0, 5).map((aiSignal: any, index: number) => {
      const marketInfo = topCandidates.find(c => c.symbol === aiSignal.symbol) || topCandidates[index];
      
      // Validate and default direction based on market data if AI didn't provide one
      let direction: "long" | "short" = aiSignal.direction;
      if (!direction || (direction !== "long" && direction !== "short")) {
        // Use momentum-based fallback
        if (marketInfo) {
          const range = marketInfo.high24h - marketInfo.low24h;
          const positionInRange = range > 0 ? (marketInfo.price - marketInfo.low24h) / range : 0.5;
          
          if (marketInfo.priceChange1h < -0.3) {
            direction = "short";
          } else if (marketInfo.priceChange1h > 0.3) {
            direction = "long";
          } else if (positionInRange > 0.7) {
            direction = "short";
          } else {
            direction = "long";
          }
        } else {
          direction = "long";
        }
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
        reasoning: aiSignal.reasoning || "AI-generated signal",
        tradeType: mode === "futures" ? "futures" : "spot" as "spot" | "futures",
      };
    });

    // If no AI signals, use algorithmic with proper direction detection
    if (signals.length === 0) {
      const fallbackSignals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => {
        const range = candidate.high24h - candidate.low24h;
        const positionInRange = range > 0 ? (candidate.price - candidate.low24h) / range : 0.5;
        
        let direction: "long" | "short";
        if (candidate.priceChange1h < -0.3) {
          direction = "short";
        } else if (candidate.priceChange1h > 0.3) {
          direction = "long";
        } else if (positionInRange > 0.7) {
          direction = "short";
        } else if (positionInRange < 0.3) {
          direction = "long";
        } else {
          direction = candidate.momentum === "bearish" ? "short" : "long";
        }
        
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
          reasoning: `${direction.toUpperCase()} - ${candidate.momentum} momentum with ${candidate.volatility} volatility`,
          tradeType: mode === "futures" ? "futures" : "spot" as "spot" | "futures",
        };
      });

      return new Response(JSON.stringify({
        signals: fallbackSignals,
        analyzedAt: new Date().toISOString(),
        nextAnalysisIn: 30,
        source: "algorithmic",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Generated", signals.length, "trading signals");

    return new Response(JSON.stringify({
      signals,
      analyzedAt: new Date().toISOString(),
      nextAnalysisIn: 30,
      source: "ai",
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

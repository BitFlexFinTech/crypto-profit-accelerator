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

// Fetch market data from exchange public APIs
async function fetchBinanceData(): Promise<MarketData[]> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!response.ok) throw new Error("Binance API error");
    const data = await response.json();
    
    return data
      .filter((t: any) => t.symbol.endsWith("USDT") && parseFloat(t.quoteVolume) > 1000000)
      .slice(0, 20)
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
    
    return data.data
      .filter((t: any) => t.instId.endsWith("-USDT") && parseFloat(t.volCcy24h) > 1000000)
      .slice(0, 20)
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
    
    return data.result.list
      .filter((t: any) => t.symbol.endsWith("USDT") && parseFloat(t.turnover24h) > 1000000)
      .slice(0, 20)
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
    
    return data.data.ticker
      .filter((t: any) => t.symbol.endsWith("-USDT") && parseFloat(t.volValue) > 1000000)
      .slice(0, 20)
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

function calculateScore(data: MarketData, aggressiveness: string): number {
  const volatilityScore = calculateVolatility(data.high24h, data.low24h, data.price) === "high" ? 30 : 
                          calculateVolatility(data.high24h, data.low24h, data.price) === "medium" ? 20 : 10;
  
  const momentumScore = Math.abs(data.priceChange1h) * 5 + Math.abs(data.priceChange24h);
  const volumeScore = Math.min(data.volume24h / 10000000, 30);
  
  let baseScore = volatilityScore + momentumScore + volumeScore;
  
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
    
    console.log("Analyzing pairs for exchanges:", exchanges, "mode:", mode, "aggressiveness:", aggressiveness);

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
    
    console.log("Fetched market data from", allMarketData.length, "exchanges");

    // Prepare data for AI analysis
    const marketSummary = allMarketData.flatMap(({ exchange, data }) =>
      data.slice(0, 10).map(d => ({
        exchange,
        ...d,
        volatility: calculateVolatility(d.high24h, d.low24h, d.price),
        momentum: calculateMomentum(d.priceChange1h, d.priceChange24h),
        score: calculateScore(d, aggressiveness),
      }))
    );

    // Sort by score and get top candidates
    marketSummary.sort((a, b) => b.score - a.score);
    const topCandidates = marketSummary.slice(0, 15);

    // Use Lovable AI for intelligent analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiPrompt = `You are an expert HFT crypto trading analyst. Analyze these top trading candidates and provide specific trading signals.

Market Data (sorted by opportunity score):
${JSON.stringify(topCandidates, null, 2)}

Trading Parameters:
- Mode: ${mode} (spot targets $1 profit, futures targets $3 profit)
- Aggressiveness: ${aggressiveness}
- Order size: $333-$450 per trade

For each of the top 5 opportunities, provide:
1. Direction (long/short) based on momentum
2. Confidence level (0-1)
3. Estimated time to reach profit target
4. Brief reasoning (1-2 sentences)

Respond ONLY with a JSON array of signals in this exact format:
[
  {
    "symbol": "BTC/USDT",
    "direction": "long",
    "confidence": 0.85,
    "timeToProfit": "2-5 min",
    "reasoning": "Strong bullish momentum with high volume support."
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
      // Fall back to algorithmic analysis
      const signals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => ({
        exchange: candidate.exchange,
        symbol: candidate.symbol,
        direction: candidate.momentum === "bullish" ? "long" : candidate.momentum === "bearish" ? "short" : (Math.random() > 0.5 ? "long" : "short"),
        score: candidate.score,
        confidence: Math.min(candidate.score / 100, 0.9),
        volatility: candidate.volatility,
        momentum: candidate.momentum,
        estimatedTimeToProfit: candidate.volatility === "high" ? "1-3 min" : candidate.volatility === "medium" ? "3-8 min" : "8-15 min",
        entryPrice: candidate.price,
        targetPrice: candidate.price * (candidate.momentum === "bullish" ? 1.001 : 0.999),
        reasoning: `${candidate.momentum.charAt(0).toUpperCase() + candidate.momentum.slice(1)} momentum with ${candidate.volatility} volatility. 24h change: ${candidate.priceChange24h.toFixed(2)}%`,
        tradeType: mode === "futures" ? "futures" : "spot",
      }));

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
      
      return {
        exchange: marketInfo?.exchange || exchanges[0] || "binance",
        symbol: aiSignal.symbol || marketInfo?.symbol || "BTC/USDT",
        direction: aiSignal.direction || "long",
        score: marketInfo?.score || 50,
        confidence: aiSignal.confidence || 0.5,
        volatility: marketInfo?.volatility || "medium",
        momentum: marketInfo?.momentum || "neutral",
        estimatedTimeToProfit: aiSignal.timeToProfit || "5-10 min",
        entryPrice: marketInfo?.price || 0,
        targetPrice: marketInfo?.price ? marketInfo.price * (aiSignal.direction === "long" ? 1.001 : 0.999) : 0,
        reasoning: aiSignal.reasoning || "AI-generated signal",
        tradeType: mode === "futures" ? "futures" : "spot" as "spot" | "futures",
      };
    });

    // If no AI signals, use algorithmic
    if (signals.length === 0) {
      const fallbackSignals: TradingSignal[] = topCandidates.slice(0, 5).map(candidate => ({
        exchange: candidate.exchange,
        symbol: candidate.symbol,
        direction: candidate.momentum === "bullish" ? "long" : "short" as "long" | "short",
        score: candidate.score,
        confidence: Math.min(candidate.score / 100, 0.9),
        volatility: candidate.volatility,
        momentum: candidate.momentum,
        estimatedTimeToProfit: candidate.volatility === "high" ? "1-3 min" : "5-10 min",
        entryPrice: candidate.price,
        targetPrice: candidate.price * 1.001,
        reasoning: `${candidate.momentum} momentum with ${candidate.volatility} volatility`,
        tradeType: mode === "futures" ? "futures" : "spot" as "spot" | "futures",
      }));

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

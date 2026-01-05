import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple rate limiting state (per-invocation tracking)
interface RateLimitState {
  lastRequestTime: number;
  requestCount: number;
}

const rateLimitState: Record<string, RateLimitState> = {
  binance: { lastRequestTime: 0, requestCount: 0 },
  okx: { lastRequestTime: 0, requestCount: 0 },
};

// Exponential backoff retry
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check for rate limit errors
      if (response.status === 429 || response.status === 418) {
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 32000);
        console.log(`[Price Proxy] Rate limited (${response.status}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      // Check for server errors
      if (response.status >= 500) {
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 32000);
        console.log(`[Price Proxy] Server error (${response.status}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 32000);
        console.log(`[Price Proxy] Network error, retrying in ${Math.round(delay)}ms: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[Price Proxy] Fetching prices from exchanges...");

  try {
    // Try Binance first (usually fastest and most reliable)
    const binanceRes = await fetchWithRetry("https://api.binance.com/api/v3/ticker/24hr", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (binanceRes.ok) {
      const binanceData = await binanceRes.json();
      
      // Log rate limit headers
      const usedWeight = binanceRes.headers.get('x-mbx-used-weight-1m');
      if (usedWeight) {
        console.log(`[Price Proxy] Binance weight: ${usedWeight}/2400`);
      }
      
      console.log(`[Price Proxy] Binance: ${binanceData.length} tickers`);
      
      return new Response(
        JSON.stringify({
          success: true,
          source: "binance",
          data: binanceData,
          timestamp: Date.now(),
          rateLimit: usedWeight ? { used: parseInt(usedWeight), limit: 2400 } : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.warn(`[Price Proxy] Binance failed (${binanceRes.status}), trying OKX...`);

    // Fallback to OKX
    const okxRes = await fetchWithRetry("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (okxRes.ok) {
      const okxData = await okxRes.json();
      
      // Log rate limit headers
      const remaining = okxRes.headers.get('x-ratelimit-remaining');
      const limit = okxRes.headers.get('x-ratelimit-limit');
      if (remaining && limit) {
        console.log(`[Price Proxy] OKX: ${remaining}/${limit} remaining`);
      }
      
      console.log(`[Price Proxy] OKX: ${okxData.data?.length || 0} tickers`);
      
      return new Response(
        JSON.stringify({
          success: true,
          source: "okx",
          data: okxData.data || [],
          timestamp: Date.now(),
          rateLimit: remaining && limit ? { used: parseInt(limit) - parseInt(remaining), limit: parseInt(limit) } : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error(`[Price Proxy] Both exchanges failed`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: "All price sources unavailable",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[Price Proxy] Error:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

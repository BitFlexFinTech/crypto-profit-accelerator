import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[Price Proxy] Fetching prices from exchanges...");

  try {
    // Try Binance first (usually fastest and most reliable)
    const binanceRes = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (binanceRes.ok) {
      const binanceData = await binanceRes.json();
      console.log(`[Price Proxy] Binance: ${binanceData.length} tickers`);
      
      return new Response(
        JSON.stringify({
          success: true,
          source: "binance",
          data: binanceData,
          timestamp: Date.now(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.warn(`[Price Proxy] Binance failed (${binanceRes.status}), trying OKX...`);

    // Fallback to OKX
    const okxRes = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (okxRes.ok) {
      const okxData = await okxRes.json();
      console.log(`[Price Proxy] OKX: ${okxData.data?.length || 0} tickers`);
      
      return new Response(
        JSON.stringify({
          success: true,
          source: "okx",
          data: okxData.data || [],
          timestamp: Date.now(),
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

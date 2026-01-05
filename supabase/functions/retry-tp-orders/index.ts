import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

// LOT_SIZE precision for common trading pairs
const QUANTITY_PRECISION: Record<string, number> = {
  'BTC': 5, 'ETH': 4, 'SOL': 3, 'BNB': 3, 'LTC': 3,
  'AVAX': 2, 'LINK': 2, 'UNI': 2, 'AAVE': 2, 'DOT': 1,
  'ATOM': 1, 'NEAR': 1, 'OP': 1, 'ARB': 1, 'XRP': 1,
  'MATIC': 0, 'ADA': 0, 'DOGE': 0, 'SHIB': 0, 'TRX': 0,
};

// OKX SWAP contract sizes
const OKX_CONTRACT_SIZE: Record<string, number> = {
  'BTC': 0.01, 'ETH': 0.1, 'SOL': 1, 'DOT': 10, 'XRP': 100,
  'DOGE': 1000, 'ADA': 100, 'LINK': 1, 'AVAX': 1, 'MATIC': 100,
  'LTC': 0.1, 'BNB': 0.1, 'ATOM': 1, 'NEAR': 10, 'UNI': 1,
};

function formatSymbol(symbol: string, exchange: string, tradeType: "spot" | "futures"): string {
  const base = symbol.replace("/", "");
  switch (exchange) {
    case "binance":
      return base;
    case "okx":
      if (tradeType === "futures") {
        return symbol.replace("/", "-") + "-SWAP";
      }
      return symbol.replace("/", "-");
    default:
      return base;
  }
}

function formatQuantity(quantity: number, symbol: string, exchange?: string, tradeType?: "spot" | "futures"): string {
  const baseAsset = symbol.replace(/[-\/]?(USDT|USDC|BUSD|USD).*$/i, '').toUpperCase();
  
  if (exchange === 'okx' && tradeType === 'futures') {
    const contractSize = OKX_CONTRACT_SIZE[baseAsset] ?? 1;
    const numContracts = Math.floor(quantity / contractSize);
    return numContracts.toString();
  }
  
  const precision = QUANTITY_PRECISION[baseAsset] ?? 2;
  const multiplier = Math.pow(10, precision);
  const roundedQty = Math.floor(quantity * multiplier) / multiplier;
  return roundedQty.toFixed(precision);
}

function formatPrice(price: number): string {
  if (price > 1000) return price.toFixed(2);
  if (price > 1) return price.toFixed(4);
  return price.toFixed(6);
}

// ============================================
// BINANCE - PLACE LIMIT TP ORDER
// ============================================
async function placeBinanceLimitTP(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  price: number,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(symbol, "binance", tradeType);
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      side: side,
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: formatQuantity(quantity, symbol),
      price: formatPrice(price),
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    const baseUrl = tradeType === "futures" 
      ? "https://fapi.binance.com/fapi/v1/order"
      : "https://api.binance.com/api/v3/order";
    
    console.log(`[Binance TP Retry] Placing LIMIT ${side} @ ${price}`);
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Binance TP Retry] Failed:`, data);
      return { success: false, error: data.msg || "Binance API error" };
    }
    
    console.log(`[Binance TP Retry] Order placed: ${data.orderId}`);
    return { success: true, orderId: data.orderId.toString() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// OKX - PLACE LIMIT TP ORDER
// ============================================
async function placeOKXLimitTP(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  price: number,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(symbol, "okx", tradeType);
    
    const body = JSON.stringify({
      instId: formattedSymbol,
      tdMode: tradeType === "futures" ? "cross" : "cash",
      side: side.toLowerCase(),
      ordType: "limit",
      sz: formatQuantity(quantity, symbol, "okx", tradeType),
      px: formatPrice(price),
    });
    
    const preHash = timestamp + "POST" + "/api/v5/trade/order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX TP Retry] Placing LIMIT ${side} @ ${price}`);
    
    const response = await fetch("https://www.okx.com/api/v5/trade/order", {
      method: "POST",
      headers: {
        "OK-ACCESS-KEY": credentials.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": credentials.passphrase || "",
        "Content-Type": "application/json",
      },
      body,
    });
    
    const data = await response.json();
    
    if (data.code !== "0") {
      console.error(`[OKX TP Retry] Failed:`, data);
      return { success: false, error: data.msg || "OKX API error" };
    }
    
    const orderId = data.data?.[0]?.ordId;
    console.log(`[OKX TP Retry] Order placed: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== RETRY TP ORDERS START ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find positions with failed TP status (error or missing order ID)
    const { data: failedPositions, error: fetchError } = await supabase
      .from("positions")
      .select("*, exchanges(*)")
      .eq("status", "open")
      .eq("is_paper_trade", false)
      .or("take_profit_status.eq.error,take_profit_order_id.is.null");

    if (fetchError) throw fetchError;

    // Filter to only include positions that have a TP price but no valid TP order
    const positionsToRetry = (failedPositions || []).filter(p => 
      p.take_profit_price && 
      p.take_profit_price > 0 &&
      (p.take_profit_status === "error" || !p.take_profit_order_id)
    );

    console.log(`[TP Retry] Found ${positionsToRetry.length} positions needing TP retry`);

    if (positionsToRetry.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          retried: 0,
          succeeded: 0,
          failed: 0,
          message: "No positions need TP retry",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let retried = 0;
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const position of positionsToRetry) {
      const exchange = position.exchanges;
      if (!exchange?.api_key_encrypted || !exchange?.api_secret_encrypted) {
        console.log(`[TP Retry] Skipping ${position.symbol} - no credentials`);
        continue;
      }

      const credentials: ExchangeCredentials = {
        exchange: exchange.exchange,
        apiKey: exchange.api_key_encrypted,
        apiSecret: exchange.api_secret_encrypted,
        passphrase: exchange.passphrase_encrypted || undefined,
      };

      // Calculate TP side based on direction
      const tpSide = position.direction === "long" ? "SELL" : "BUY";
      const tpPrice = Number(position.take_profit_price);
      const quantity = Number(position.quantity);

      console.log(`[TP Retry] ${position.symbol}: Attempting ${tpSide} @ ${tpPrice}`);
      retried++;

      let result: { success: boolean; orderId?: string; error?: string };

      switch (exchange.exchange) {
        case "binance":
          result = await placeBinanceLimitTP(
            credentials,
            position.symbol,
            tpSide,
            tpPrice,
            quantity,
            position.trade_type
          );
          break;
        case "okx":
          result = await placeOKXLimitTP(
            credentials,
            position.symbol,
            tpSide,
            tpPrice,
            quantity,
            position.trade_type
          );
          break;
        default:
          result = { success: false, error: `Exchange ${exchange.exchange} not supported` };
      }

      if (result.success && result.orderId) {
        // Update position with new TP order
        const { error: updateError } = await supabase
          .from("positions")
          .update({
            take_profit_order_id: result.orderId,
            take_profit_status: "pending",
            take_profit_placed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", position.id);

        if (!updateError) {
          succeeded++;
          console.log(`[TP Retry] ${position.symbol}: SUCCESS - Order ${result.orderId}`);
        } else {
          failed++;
          errors.push(`${position.symbol}: DB update failed`);
        }
      } else {
        failed++;
        errors.push(`${position.symbol}: ${result.error}`);
        
        // Update status to show latest error
        await supabase
          .from("positions")
          .update({
            take_profit_status: "error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", position.id);
      }
    }

    console.log(`=== TP RETRY COMPLETE: ${succeeded}/${retried} succeeded ===`);

    return new Response(
      JSON.stringify({
        success: true,
        retried,
        succeeded,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[TP Retry] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

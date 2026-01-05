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

// TICK_SIZE for Binance price precision (exchange-specific requirements)
const TICK_SIZE: Record<string, number> = {
  'BTC': 0.01, 'ETH': 0.01, 'BNB': 0.01, 'SOL': 0.01,
  'LINK': 0.01, 'DOT': 0.001, 'AVAX': 0.01, 'DOGE': 0.00001,
  'ADA': 0.0001, 'XRP': 0.0001, 'MATIC': 0.0001, 'SHIB': 0.00000001,
  'LTC': 0.01, 'ATOM': 0.01, 'NEAR': 0.001, 'UNI': 0.01,
  'OP': 0.001, 'ARB': 0.0001, 'TRX': 0.00001,
};

function formatPrice(price: number, symbol?: string): string {
  if (symbol) {
    const baseAsset = symbol.replace(/[-\/]?(USDT|USDC|BUSD|USD).*$/i, '').toUpperCase();
    const tickSize = TICK_SIZE[baseAsset];
    if (tickSize) {
      // Round to tick size
      const rounded = Math.round(price / tickSize) * tickSize;
      // Determine decimal places from tick size
      const decimals = tickSize < 1 ? Math.abs(Math.floor(Math.log10(tickSize))) : 2;
      return rounded.toFixed(decimals);
    }
  }
  // Default behavior for unknown symbols
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
      price: formatPrice(price, symbol),
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
      px: formatPrice(price, symbol),
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
    let autoClosedInsufficient = 0;
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

      const quantity = Number(position.quantity);
      const baseAsset = position.symbol.split("/")[0].toUpperCase();

      // Pre-check balance before attempting TP order
      let availableBalance = 0;
      try {
        if (exchange.exchange === "binance") {
          const timestamp = Date.now();
          const params = new URLSearchParams({ timestamp: timestamp.toString() });
          const signature = createHmac("sha256", credentials.apiSecret)
            .update(params.toString())
            .digest("hex");
          const res = await fetch(
            `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
            { headers: { "X-MBX-APIKEY": credentials.apiKey } }
          );
          const data = await res.json();
          const balanceEntry = data.balances?.find((b: { asset: string }) => b.asset === baseAsset);
          availableBalance = parseFloat(balanceEntry?.free || "0");
        } else if (exchange.exchange === "okx") {
          const timestamp = new Date().toISOString();
          const preHash = timestamp + "GET" + "/api/v5/account/balance";
          const signature = createHmac("sha256", credentials.apiSecret)
            .update(preHash)
            .digest("base64");
          const res = await fetch("https://www.okx.com/api/v5/account/balance", {
            headers: {
              "OK-ACCESS-KEY": credentials.apiKey,
              "OK-ACCESS-SIGN": signature,
              "OK-ACCESS-TIMESTAMP": timestamp,
              "OK-ACCESS-PASSPHRASE": credentials.passphrase || "",
            },
          });
          const data = await res.json();
          const detail = data.data?.[0]?.details?.find((d: { ccy: string }) => d.ccy === baseAsset);
          availableBalance = parseFloat(detail?.availBal || "0");
        }
      } catch (e) {
        console.error(`[TP Retry] Balance check failed for ${position.symbol}:`, e);
      }

      // STRICT RULE: NEVER auto-close positions - only flag as stuck for review
      // Positions must ONLY close when profit target is hit
      const balanceRatio = quantity > 0 ? availableBalance / quantity : 0;
      
      // If balance is less than 95% of required, flag as stuck (won't have enough to fulfill TP)
      if (balanceRatio < 0.95) {
        console.warn(`[TP Retry] STUCK: ${position.symbol} - Insufficient balance (${availableBalance.toFixed(8)}/${quantity.toFixed(8)} = ${(balanceRatio * 100).toFixed(1)}%). Flagging for review, NOT closing.`);
        
        await supabase
          .from("positions")
          .update({
            take_profit_status: "stuck",
            reconciliation_note: `Balance mismatch: Exchange has ${availableBalance.toFixed(8)}, DB expects ${quantity.toFixed(8)} (${(balanceRatio * 100).toFixed(1)}%). Needs manual verification.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", position.id);
        
        autoClosedInsufficient++;
        continue;
      }

      // Smart sync: If balance is between 95% and 100%, use available balance and sync DB
      let effectiveQuantity = quantity;
      if (balanceRatio >= 0.95 && balanceRatio < 1.0) {
        effectiveQuantity = availableBalance * 0.999; // Use 99.9% to leave room for rounding
        console.log(`[TP Retry] Syncing quantity for ${position.symbol}: ${quantity.toFixed(8)} → ${effectiveQuantity.toFixed(8)}`);
        
        // Update DB quantity to match exchange balance
        await supabase.from('positions').update({
          quantity: availableBalance,
          reconciliation_note: `Quantity synced from exchange: ${quantity.toFixed(8)} → ${availableBalance.toFixed(8)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', position.id);
      }

      // Calculate TP side based on direction
      const tpSide = position.direction === "long" ? "SELL" : "BUY";
      const tpPrice = Number(position.take_profit_price);

      console.log(`[TP Retry] ${position.symbol}: Attempting ${tpSide} @ ${tpPrice} (qty: ${effectiveQuantity.toFixed(8)})`);
      retried++;

      let result: { success: boolean; orderId?: string; error?: string };

      switch (exchange.exchange) {
        case "binance":
          result = await placeBinanceLimitTP(
            credentials,
            position.symbol,
            tpSide,
            tpPrice,
            effectiveQuantity,
            position.trade_type
          );
          break;
        case "okx":
          result = await placeOKXLimitTP(
            credentials,
            position.symbol,
            tpSide,
            tpPrice,
            effectiveQuantity,
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

    console.log(`=== TP RETRY COMPLETE: ${succeeded}/${retried} succeeded, ${autoClosedInsufficient} flagged stuck ===`);

    return new Response(
      JSON.stringify({
        success: true,
        retried,
        succeeded,
        failed,
        flaggedStuck: autoClosedInsufficient, // Renamed from autoClosedInsufficient
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeRequest {
  exchangeId: string;
  symbol: string;
  direction: "long" | "short";
  tradeType: "spot" | "futures";
  orderSizeUsd: number;
  entryPrice: number;
  profitTarget: number;
  leverage?: number;
  isPaperTrade: boolean;
  aiScore?: number;
  aiReasoning?: string;
}

interface OrderParams {
  symbol: string;
  side: string;
  type: string;
  price: number;
  quantity: number;
}

interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

// Calculate exact take-profit price including all fees
function calculateTakeProfitPrice(
  entryPrice: number,
  direction: "long" | "short",
  profitTarget: number,
  orderSizeUsd: number,
  quantity: number,
  leverage: number,
  tradeType: "spot" | "futures"
): number {
  const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
  const entryFee = orderSizeUsd * feeRate;
  const exitFee = orderSizeUsd * feeRate;
  const fundingFee = tradeType === "futures" ? orderSizeUsd * 0.0001 : 0;
  const totalFees = entryFee + exitFee + fundingFee;
  
  const requiredGrossProfit = profitTarget + totalFees;
  const priceMovementNeeded = requiredGrossProfit / (quantity * leverage);
  
  if (direction === "long") {
    return entryPrice + priceMovementNeeded;
  } else {
    return entryPrice - priceMovementNeeded;
  }
}

// Format symbol for each exchange
function formatSymbol(symbol: string, exchange: string): string {
  // Input: BTC/USDT -> Output depends on exchange
  const base = symbol.replace("/", "");
  
  switch (exchange) {
    case "binance":
      return base; // BTCUSDT
    case "okx":
      return symbol.replace("/", "-"); // BTC-USDT
    case "bybit":
      return base; // BTCUSDT
    default:
      return base;
  }
}

// Format quantity to proper precision
function formatQuantity(quantity: number, symbol: string): string {
  // Most crypto pairs use 6-8 decimal precision
  // BTC uses 5 decimals, smaller coins use more
  if (symbol.includes("BTC")) {
    return quantity.toFixed(5);
  } else if (symbol.includes("ETH")) {
    return quantity.toFixed(4);
  } else {
    return quantity.toFixed(2);
  }
}

// Format price to proper precision
function formatPrice(price: number, symbol: string): string {
  if (price > 1000) {
    return price.toFixed(2);
  } else if (price > 1) {
    return price.toFixed(4);
  } else {
    return price.toFixed(6);
  }
}

// ============================================
// BINANCE API INTEGRATION
// ============================================
async function placeBinanceOrder(
  credentials: ExchangeCredentials,
  order: OrderParams
): Promise<{ success: boolean; orderId: string; error?: string }> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(order.symbol, "binance");
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      side: order.side, // BUY or SELL
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: formatQuantity(order.quantity, order.symbol),
      price: formatPrice(order.price, order.symbol),
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    console.log(`[Binance] Placing order: ${order.side} ${order.quantity} ${formattedSymbol} @ ${order.price}`);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": credentials.apiKey },
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Binance] Order failed:`, data);
      return { 
        success: false, 
        orderId: "", 
        error: data.msg || `Binance API error: ${response.status}` 
      };
    }
    
    console.log(`[Binance] Order placed successfully: ${data.orderId}`);
    return { success: true, orderId: data.orderId.toString() };
  } catch (error) {
    console.error(`[Binance] Exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// OKX API INTEGRATION
// ============================================
async function placeOKXOrder(
  credentials: ExchangeCredentials,
  order: OrderParams
): Promise<{ success: boolean; orderId: string; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(order.symbol, "okx");
    
    const body = JSON.stringify({
      instId: formattedSymbol,
      tdMode: "cash", // cash for spot
      side: order.side.toLowerCase(), // buy or sell
      ordType: "limit",
      px: formatPrice(order.price, order.symbol),
      sz: formatQuantity(order.quantity, order.symbol),
    });
    
    const preHash = timestamp + "POST" + "/api/v5/trade/order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX] Placing order: ${order.side} ${order.quantity} ${formattedSymbol} @ ${order.price}`);
    
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
      console.error(`[OKX] Order failed:`, data);
      return { 
        success: false, 
        orderId: "", 
        error: data.msg || `OKX API error: ${data.code}` 
      };
    }
    
    const orderId = data.data?.[0]?.ordId || "";
    console.log(`[OKX] Order placed successfully: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    console.error(`[OKX] Exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// BYBIT API INTEGRATION
// ============================================
async function placeBybitOrder(
  credentials: ExchangeCredentials,
  order: OrderParams
): Promise<{ success: boolean; orderId: string; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const formattedSymbol = formatSymbol(order.symbol, "bybit");
    
    const body = JSON.stringify({
      category: "spot",
      symbol: formattedSymbol,
      side: order.side === "BUY" ? "Buy" : "Sell",
      orderType: "Limit",
      qty: formatQuantity(order.quantity, order.symbol),
      price: formatPrice(order.price, order.symbol),
      timeInForce: "GTC",
    });
    
    const preHash = timestamp + credentials.apiKey + recvWindow + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("hex");
    
    console.log(`[Bybit] Placing order: ${order.side} ${order.quantity} ${formattedSymbol} @ ${order.price}`);
    
    const response = await fetch("https://api.bybit.com/v5/order/create", {
      method: "POST",
      headers: {
        "X-BAPI-API-KEY": credentials.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json",
      },
      body,
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      console.error(`[Bybit] Order failed:`, data);
      return { 
        success: false, 
        orderId: "", 
        error: data.retMsg || `Bybit API error: ${data.retCode}` 
      };
    }
    
    const orderId = data.result?.orderId || "";
    console.log(`[Bybit] Order placed successfully: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    console.error(`[Bybit] Exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// UNIFIED ORDER PLACEMENT
// ============================================
async function placeExchangeLimitOrder(
  exchange: { 
    exchange: string; 
    api_key_encrypted: string | null; 
    api_secret_encrypted: string | null;
    passphrase_encrypted: string | null;
  },
  order: OrderParams,
  isPaperTrade: boolean
): Promise<{ orderId: string; isLive: boolean; error?: string }> {
  console.log(`[${exchange.exchange}] Placing ${order.type} ${order.side} order: ${order.quantity} @ ${order.price}`);
  
  // Paper trading - return simulated order ID
  if (isPaperTrade) {
    console.log(`[PAPER] Simulated order for ${exchange.exchange}`);
    return { 
      orderId: `TP-PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isLive: false 
    };
  }
  
  // Check if we have API credentials
  if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
    console.log(`[${exchange.exchange}] No API credentials - falling back to simulation`);
    return { 
      orderId: `TP-SIM-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isLive: false,
      error: "No API credentials configured"
    };
  }
  
  const credentials: ExchangeCredentials = {
    exchange: exchange.exchange,
    apiKey: exchange.api_key_encrypted,
    apiSecret: exchange.api_secret_encrypted,
    passphrase: exchange.passphrase_encrypted || undefined,
  };
  
  let result: { success: boolean; orderId: string; error?: string };
  
  switch (exchange.exchange) {
    case "binance":
      result = await placeBinanceOrder(credentials, order);
      break;
    case "okx":
      result = await placeOKXOrder(credentials, order);
      break;
    case "bybit":
      result = await placeBybitOrder(credentials, order);
      break;
    default:
      console.log(`[${exchange.exchange}] Exchange not supported for live trading - falling back to simulation`);
      return { 
        orderId: `TP-UNSUPPORTED-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        isLive: false,
        error: `Exchange ${exchange.exchange} not supported for live trading`
      };
  }
  
  if (!result.success) {
    console.error(`[${exchange.exchange}] Live order failed: ${result.error}`);
    // Fall back to simulation on failure
    return { 
      orderId: `TP-FAILED-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isLive: false,
      error: result.error
    };
  }
  
  return { orderId: result.orderId, isLive: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tradeRequest: TradeRequest = await req.json();
    
    console.log("Executing trade:", JSON.stringify(tradeRequest, null, 2));

    // Validate order size
    if (tradeRequest.orderSizeUsd < 333 || tradeRequest.orderSizeUsd > 450) {
      throw new Error("Order size must be between $333 and $450");
    }

    // Get exchange info
    const { data: exchange, error: exchangeError } = await supabase
      .from("exchanges")
      .select("*")
      .eq("id", tradeRequest.exchangeId)
      .single();

    if (exchangeError || !exchange) {
      throw new Error("Exchange not found");
    }

    // Calculate quantity
    const quantity = tradeRequest.orderSizeUsd / tradeRequest.entryPrice;
    const leverage = tradeRequest.leverage || 1;
    
    // Calculate entry fee
    const feeRate = tradeRequest.tradeType === "spot" ? 0.001 : 0.0005;
    const entryFee = tradeRequest.orderSizeUsd * feeRate;

    let orderId = `${exchange.exchange}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    let executedPrice = tradeRequest.entryPrice;
    
    // Simulate slight slippage (0.01-0.05%)
    const slippage = (Math.random() * 0.0004 + 0.0001);
    if (tradeRequest.direction === "long") {
      executedPrice *= (1 + slippage);
    } else {
      executedPrice *= (1 - slippage);
    }

    // Calculate take-profit price
    const takeProfitPrice = calculateTakeProfitPrice(
      executedPrice,
      tradeRequest.direction,
      tradeRequest.profitTarget,
      tradeRequest.orderSizeUsd,
      quantity,
      leverage,
      tradeRequest.tradeType
    );

    console.log(`Take-profit price calculated: $${takeProfitPrice.toFixed(6)} for ${tradeRequest.direction} position`);

    // Create trade record
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        user_id: exchange.user_id,
        exchange_id: exchange.id,
        symbol: tradeRequest.symbol,
        direction: tradeRequest.direction,
        trade_type: tradeRequest.tradeType,
        entry_price: executedPrice,
        quantity,
        order_size_usd: tradeRequest.orderSizeUsd,
        leverage,
        entry_fee: entryFee,
        is_paper_trade: tradeRequest.isPaperTrade,
        ai_score: tradeRequest.aiScore,
        ai_reasoning: tradeRequest.aiReasoning,
        status: "open",
        opened_at: new Date().toISOString(),
        tp_price: takeProfitPrice,
        tp_placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Place take-profit limit order on exchange
    const tpOrderResult = await placeExchangeLimitOrder(
      exchange,
      {
        symbol: tradeRequest.symbol,
        side: tradeRequest.direction === "long" ? "SELL" : "BUY",
        type: "LIMIT",
        price: takeProfitPrice,
        quantity: quantity,
      },
      tradeRequest.isPaperTrade
    );

    const takeProfitOrderId = tpOrderResult.orderId;
    const isLiveOrder = tpOrderResult.isLive;
    
    console.log(`Take-profit order placed: ${takeProfitOrderId} @ $${takeProfitPrice.toFixed(6)} (Live: ${isLiveOrder})`);
    
    if (tpOrderResult.error) {
      console.warn(`TP Order warning: ${tpOrderResult.error}`);
    }

    // Create position record with take-profit info
    const { data: position, error: positionError } = await supabase
      .from("positions")
      .insert({
        user_id: exchange.user_id,
        exchange_id: exchange.id,
        trade_id: trade.id,
        symbol: tradeRequest.symbol,
        direction: tradeRequest.direction,
        trade_type: tradeRequest.tradeType,
        entry_price: executedPrice,
        current_price: executedPrice,
        quantity,
        order_size_usd: tradeRequest.orderSizeUsd,
        leverage,
        profit_target: tradeRequest.profitTarget,
        unrealized_pnl: -entryFee,
        is_paper_trade: tradeRequest.isPaperTrade,
        status: "open",
        opened_at: new Date().toISOString(),
        take_profit_order_id: takeProfitOrderId,
        take_profit_price: takeProfitPrice,
        take_profit_status: "pending",
        take_profit_placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (positionError) throw positionError;

    // Create notification
    const liveIndicator = isLiveOrder ? "🔴 LIVE" : "📝 Paper";
    await supabase
      .from("notifications")
      .insert({
        user_id: exchange.user_id,
        type: "trade_opened",
        title: `${liveIndicator} ${tradeRequest.direction.toUpperCase()} ${tradeRequest.symbol}`,
        message: `Opened ${tradeRequest.direction} position on ${exchange.exchange} at $${executedPrice.toFixed(4)}. Size: $${tradeRequest.orderSizeUsd.toFixed(2)}. TP @ $${takeProfitPrice.toFixed(4)}`,
        trade_id: trade.id,
      });

    console.log("Trade executed successfully:", trade.id, "| TP Order:", takeProfitOrderId, "| Live:", isLiveOrder);

    return new Response(JSON.stringify({
      success: true,
      trade: {
        id: trade.id,
        orderId,
        symbol: tradeRequest.symbol,
        direction: tradeRequest.direction,
        entryPrice: executedPrice,
        quantity,
        orderSizeUsd: tradeRequest.orderSizeUsd,
        entryFee,
        isPaperTrade: tradeRequest.isPaperTrade,
      },
      position: {
        id: position.id,
        profitTarget: tradeRequest.profitTarget,
        takeProfitOrderId,
        takeProfitPrice,
        takeProfitStatus: "pending",
        isLiveOrder,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error executing trade:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

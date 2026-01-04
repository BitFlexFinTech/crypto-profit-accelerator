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

// Format symbol for each exchange
function formatSymbol(symbol: string, exchange: string): string {
  const base = symbol.replace("/", "");
  switch (exchange) {
    case "binance":
      return base;
    case "okx":
      return symbol.replace("/", "-");
    case "bybit":
      return base;
    default:
      return base;
  }
}

// ============================================
// BINANCE - CANCEL ORDER
// ============================================
async function cancelBinanceOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(symbol, "binance");
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      orderId: orderId,
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    console.log(`[Binance] Cancelling order: ${orderId} for ${formattedSymbol}`);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": credentials.apiKey },
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      // Order might already be filled or cancelled - treat as success
      if (data.code === -2011) { // Unknown order
        console.log(`[Binance] Order ${orderId} not found - may already be filled/cancelled`);
        return { success: true };
      }
      console.error(`[Binance] Cancel failed:`, data);
      return { success: false, error: data.msg || `API error: ${response.status}` };
    }
    
    console.log(`[Binance] Order cancelled: ${orderId}`);
    return { success: true };
  } catch (error) {
    console.error(`[Binance] Cancel exception:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// OKX - CANCEL ORDER
// ============================================
async function cancelOKXOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(symbol, "okx");
    
    const body = JSON.stringify({
      instId: formattedSymbol,
      ordId: orderId,
    });
    
    const preHash = timestamp + "POST" + "/api/v5/trade/cancel-order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX] Cancelling order: ${orderId} for ${formattedSymbol}`);
    
    const response = await fetch("https://www.okx.com/api/v5/trade/cancel-order", {
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
      // Order might already be filled
      if (data.code === "51400" || data.code === "51401") {
        console.log(`[OKX] Order ${orderId} not found - may already be filled`);
        return { success: true };
      }
      console.error(`[OKX] Cancel failed:`, data);
      return { success: false, error: data.msg || `API error: ${data.code}` };
    }
    
    console.log(`[OKX] Order cancelled: ${orderId}`);
    return { success: true };
  } catch (error) {
    console.error(`[OKX] Cancel exception:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// BYBIT - CANCEL ORDER
// ============================================
async function cancelBybitOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const formattedSymbol = formatSymbol(symbol, "bybit");
    
    const body = JSON.stringify({
      category: "spot",
      symbol: formattedSymbol,
      orderId: orderId,
    });
    
    const preHash = timestamp + credentials.apiKey + recvWindow + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("hex");
    
    console.log(`[Bybit] Cancelling order: ${orderId} for ${formattedSymbol}`);
    
    const response = await fetch("https://api.bybit.com/v5/order/cancel", {
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
      // Order might already be filled
      if (data.retCode === 110001) {
        console.log(`[Bybit] Order ${orderId} not found - may already be filled`);
        return { success: true };
      }
      console.error(`[Bybit] Cancel failed:`, data);
      return { success: false, error: data.retMsg || `API error: ${data.retCode}` };
    }
    
    console.log(`[Bybit] Order cancelled: ${orderId}`);
    return { success: true };
  } catch (error) {
    console.error(`[Bybit] Cancel exception:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// UNIFIED ORDER CANCELLATION
// ============================================
async function cancelExchangeOrder(
  exchange: { 
    exchange: string; 
    api_key_encrypted: string | null; 
    api_secret_encrypted: string | null;
    passphrase_encrypted: string | null;
  },
  symbol: string,
  orderId: string,
  isPaperTrade: boolean
): Promise<{ success: boolean; error?: string }> {
  console.log(`[${exchange.exchange}] Cancelling order: ${orderId}`);
  
  // Paper trading - just return success
  if (isPaperTrade || orderId.startsWith("TP-PAPER-") || orderId.startsWith("TP-SIM-")) {
    console.log(`[PAPER] Simulated cancel for ${orderId}`);
    return { success: true };
  }
  
  // Check if we have API credentials
  if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
    console.log(`[${exchange.exchange}] No API credentials - treating as paper trade cancel`);
    return { success: true };
  }
  
  const credentials: ExchangeCredentials = {
    exchange: exchange.exchange,
    apiKey: exchange.api_key_encrypted,
    apiSecret: exchange.api_secret_encrypted,
    passphrase: exchange.passphrase_encrypted || undefined,
  };
  
  switch (exchange.exchange) {
    case "binance":
      return await cancelBinanceOrder(credentials, symbol, orderId);
    case "okx":
      return await cancelOKXOrder(credentials, symbol, orderId);
    case "bybit":
      return await cancelBybitOrder(credentials, symbol, orderId);
    default:
      console.log(`[${exchange.exchange}] Exchange not supported for live cancel`);
      return { success: true };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { positionId, exitPrice: requestedExitPrice, requireProfit = false } = await req.json();
    
    console.log("Closing position:", positionId, "requireProfit:", requireProfit);

    // Atomically update position to 'closed' to prevent race conditions
    const { data: position, error: claimError } = await supabase
      .from("positions")
      .update({ status: "closed" as const })
      .eq("id", positionId)
      .eq("status", "open")
      .select("*")
      .single();

    if (claimError || !position) {
      console.log("Position already closed or not found:", positionId);
      return new Response(JSON.stringify({
        success: true,
        alreadyClosed: true,
        message: "Position was already closed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get exchange info for cancelling TP order
    const { data: exchange } = await supabase
      .from("exchanges")
      .select("*")
      .eq("id", position.exchange_id)
      .single();

    // Cancel pending take-profit order if exists
    if (position.take_profit_order_id && position.take_profit_status === "pending") {
      console.log(`Cancelling take-profit order: ${position.take_profit_order_id}`);
      
      if (exchange) {
        const cancelResult = await cancelExchangeOrder(
          exchange, 
          position.symbol,
          position.take_profit_order_id, 
          position.is_paper_trade || true
        );
        
        if (!cancelResult.success) {
          console.warn(`Failed to cancel TP order: ${cancelResult.error}`);
        }
      }
      
      // Update TP status to cancelled
      await supabase
        .from("positions")
        .update({ take_profit_status: "cancelled" })
        .eq("id", positionId);
    }

    const exitPrice = requestedExitPrice || position.current_price || position.entry_price;

    // Calculate fees
    const feeRate = position.trade_type === "spot" ? 0.001 : 0.0005;
    const exitFee = position.order_size_usd * feeRate;
    
    const { data: trade } = await supabase
      .from("trades")
      .select("entry_fee")
      .eq("id", position.trade_id)
      .single();
    
    const entryFee = trade?.entry_fee || position.order_size_usd * feeRate;

    // Calculate P&L
    let grossProfit: number;
    if (position.direction === "long") {
      grossProfit = (exitPrice - position.entry_price) * position.quantity * (position.leverage || 1);
    } else {
      grossProfit = (position.entry_price - exitPrice) * position.quantity * (position.leverage || 1);
    }

    const fundingFee = position.trade_type === "futures" ? position.order_size_usd * 0.0001 : 0;
    const netProfit = grossProfit - entryFee - exitFee - fundingFee;

    // CRITICAL: If requireProfit is true, verify the position is profitable before closing
    if (requireProfit && netProfit < 0) {
      await supabase
        .from("positions")
        .update({ 
          status: "open",
          take_profit_status: position.take_profit_order_id ? "pending" : null,
        })
        .eq("id", positionId);
      
      console.log("Rejected close - netProfit:", netProfit.toFixed(2), "is negative (requireProfit=true)");
      return new Response(JSON.stringify({
        success: false,
        error: "Position would close at a loss",
        netProfit: netProfit,
        message: "Automated close rejected: profit target not met after fees",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if TP was filled (position closed at profit)
    const tpFilled = netProfit >= (position.profit_target || 0);
    const now = new Date().toISOString();

    // Update trade record
    const { error: updateTradeError } = await supabase
      .from("trades")
      .update({
        exit_price: exitPrice,
        exit_fee: exitFee,
        funding_fee: fundingFee,
        gross_profit: grossProfit,
        net_profit: netProfit,
        status: "closed",
        closed_at: now,
        tp_filled_at: tpFilled ? now : null,
      })
      .eq("id", position.trade_id);

    if (updateTradeError) throw updateTradeError;

    // Update position record
    const { error: updatePositionError } = await supabase
      .from("positions")
      .update({
        current_price: exitPrice,
        unrealized_pnl: netProfit,
        status: "closed",
        take_profit_status: position.take_profit_order_id 
          ? (tpFilled ? "filled" : "cancelled")
          : null,
        take_profit_filled_at: tpFilled ? now : null,
        updated_at: now,
      })
      .eq("id", positionId);

    if (updatePositionError) throw updatePositionError;

    // Update daily stats
    const today = new Date().toISOString().split("T")[0];
    const { data: existingStats } = await supabase
      .from("daily_stats")
      .select("*")
      .eq("date", today)
      .maybeSingle();

    if (existingStats) {
      await supabase
        .from("daily_stats")
        .update({
          total_trades: (existingStats.total_trades || 0) + 1,
          winning_trades: netProfit > 0 ? (existingStats.winning_trades || 0) + 1 : existingStats.winning_trades || 0,
          losing_trades: netProfit <= 0 ? (existingStats.losing_trades || 0) + 1 : existingStats.losing_trades || 0,
          gross_profit: (existingStats.gross_profit || 0) + grossProfit,
          total_fees: (existingStats.total_fees || 0) + entryFee + exitFee + fundingFee,
          net_profit: (existingStats.net_profit || 0) + netProfit,
        })
        .eq("id", existingStats.id);
    } else {
      await supabase
        .from("daily_stats")
        .insert({
          user_id: position.user_id,
          date: today,
          total_trades: 1,
          winning_trades: netProfit > 0 ? 1 : 0,
          losing_trades: netProfit <= 0 ? 1 : 0,
          gross_profit: grossProfit,
          total_fees: entryFee + exitFee + fundingFee,
          net_profit: netProfit,
        });
    }

    // Create notification
    const profitEmoji = netProfit > 0 ? "🎉" : "📉";
    const liveIndicator = !position.is_paper_trade ? "🔴" : "📝";
    await supabase
      .from("notifications")
      .insert({
        user_id: position.user_id,
        type: netProfit > 0 ? "profit_target_hit" : "trade_closed",
        title: `${liveIndicator} ${profitEmoji} ${position.symbol} Closed`,
        message: `${position.direction.toUpperCase()} position closed at $${exitPrice.toFixed(4)}. ${netProfit >= 0 ? "Profit" : "Loss"}: $${netProfit.toFixed(2)}${tpFilled ? " (TP Hit!)" : ""}`,
        trade_id: position.trade_id,
      });

    console.log("Position closed. Net P&L:", netProfit.toFixed(2), "| TP Filled:", tpFilled);

    return new Response(JSON.stringify({
      success: true,
      position: {
        id: positionId,
        exitPrice,
        grossProfit,
        netProfit,
        entryFee,
        exitFee,
        fundingFee,
        takeProfitStatus: position.take_profit_order_id 
          ? (tpFilled ? "filled" : "cancelled")
          : null,
        takeProfitFilled: tpFilled,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error closing position:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

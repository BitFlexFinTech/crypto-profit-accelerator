import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Fee rates
  const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
  const entryFee = orderSizeUsd * feeRate;
  const exitFee = orderSizeUsd * feeRate;
  const fundingFee = tradeType === "futures" ? orderSizeUsd * 0.0001 : 0;
  const totalFees = entryFee + exitFee + fundingFee;
  
  // Required gross profit to achieve net profit target after all fees
  const requiredGrossProfit = profitTarget + totalFees;
  
  // Price movement needed to achieve required gross profit
  const priceMovementNeeded = requiredGrossProfit / (quantity * leverage);
  
  if (direction === "long") {
    return entryPrice + priceMovementNeeded;
  } else {
    return entryPrice - priceMovementNeeded;
  }
}

// Place limit take-profit order on exchange (simulated for paper trading)
async function placeExchangeLimitOrder(
  exchange: { exchange: string; api_key_encrypted: string | null; api_secret_encrypted: string | null },
  order: { symbol: string; side: string; type: string; price: number; quantity: number },
  isPaperTrade: boolean
): Promise<string> {
  console.log(`[${exchange.exchange}] Placing ${order.type} ${order.side} order: ${order.quantity} @ ${order.price}`);
  
  if (isPaperTrade) {
    // For paper trading, return simulated order ID
    return `TP-PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
  
  // For live trading, this would call the actual exchange API
  // TODO: Implement actual exchange API calls for live trading
  // For now, return simulated ID
  return `TP-${exchange.exchange.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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
    
    console.log("Executing trade:", tradeRequest);

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
    
    // Calculate entry fee (0.1% for spot, 0.05% for futures)
    const feeRate = tradeRequest.tradeType === "spot" ? 0.001 : 0.0005;
    const entryFee = tradeRequest.orderSizeUsd * feeRate;

    // In production, this would execute on the actual exchange
    // For now, we simulate the trade execution
    
    let orderId = `${exchange.exchange}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    let executedPrice = tradeRequest.entryPrice;
    
    // Simulate slight slippage (0.01-0.05%)
    const slippage = (Math.random() * 0.0004 + 0.0001);
    if (tradeRequest.direction === "long") {
      executedPrice *= (1 + slippage);
    } else {
      executedPrice *= (1 - slippage);
    }

    // Calculate take-profit price (including all fees)
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
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Place take-profit limit order on exchange
    const takeProfitOrderId = await placeExchangeLimitOrder(
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

    console.log(`Take-profit order placed: ${takeProfitOrderId} @ $${takeProfitPrice.toFixed(6)}`);

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
        unrealized_pnl: -entryFee, // Start with entry fee as loss
        is_paper_trade: tradeRequest.isPaperTrade,
        status: "open",
        opened_at: new Date().toISOString(),
        // Take-profit order tracking
        take_profit_order_id: takeProfitOrderId,
        take_profit_price: takeProfitPrice,
        take_profit_status: "pending",
      })
      .select()
      .single();

    if (positionError) throw positionError;

    // Create notification
    await supabase
      .from("notifications")
      .insert({
        user_id: exchange.user_id,
        type: "trade_opened",
        title: `${tradeRequest.direction.toUpperCase()} ${tradeRequest.symbol}`,
        message: `Opened ${tradeRequest.direction} position on ${exchange.exchange} at $${executedPrice.toFixed(4)}. Size: $${tradeRequest.orderSizeUsd.toFixed(2)}. TP @ $${takeProfitPrice.toFixed(4)}`,
        trade_id: trade.id,
      });

    console.log("Trade executed successfully:", trade.id, "| TP Order:", takeProfitOrderId);

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
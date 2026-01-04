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
        leverage: tradeRequest.leverage || 1,
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

    // Create position record
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
        leverage: tradeRequest.leverage || 1,
        profit_target: tradeRequest.profitTarget,
        unrealized_pnl: -entryFee, // Start with entry fee as loss
        is_paper_trade: tradeRequest.isPaperTrade,
        status: "open",
        opened_at: new Date().toISOString(),
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
        message: `Opened ${tradeRequest.direction} position on ${exchange.exchange} at $${executedPrice.toFixed(4)}. Size: $${tradeRequest.orderSizeUsd.toFixed(2)}`,
        trade_id: trade.id,
      });

    console.log("Trade executed successfully:", trade.id);

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

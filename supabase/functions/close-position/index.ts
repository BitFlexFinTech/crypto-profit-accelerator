import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cancel take-profit order on exchange (simulated for paper trading)
async function cancelExchangeOrder(
  exchange: { exchange: string; api_key_encrypted: string | null; api_secret_encrypted: string | null },
  orderId: string,
  isPaperTrade: boolean
): Promise<boolean> {
  console.log(`[${exchange.exchange}] Cancelling order: ${orderId}`);
  
  if (isPaperTrade) {
    // For paper trading, just return success
    return true;
  }
  
  // For live trading, this would call the actual exchange API
  // TODO: Implement actual exchange API calls for live trading
  return true;
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
      // Position was already closed or doesn't exist - return success (idempotent)
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
        await cancelExchangeOrder(exchange, position.take_profit_order_id, position.is_paper_trade || true);
      }
      
      // Update TP status to cancelled
      await supabase
        .from("positions")
        .update({ take_profit_status: "cancelled" })
        .eq("id", positionId);
    }

    // Use requested exit price if provided (for automated closes), otherwise use current price
    // For automated closes with requireProfit=true, we use the exact price from frontend
    // to ensure the profit calculation matches what triggered the close
    const exitPrice = requestedExitPrice || position.current_price || position.entry_price;

    // Calculate fees
    const feeRate = position.trade_type === "spot" ? 0.001 : 0.0005;
    const exitFee = position.order_size_usd * feeRate;
    
    // Get entry fee from trade
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
      // Revert the position back to 'open' since we can't close at a loss
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
        closed_at: new Date().toISOString(),
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
          ? (netProfit >= (position.profit_target || 0) ? "filled" : "cancelled")
          : null,
        updated_at: new Date().toISOString(),
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
    await supabase
      .from("notifications")
      .insert({
        user_id: position.user_id,
        type: netProfit > 0 ? "profit_target_hit" : "trade_closed",
        title: `${profitEmoji} ${position.symbol} Closed`,
        message: `${position.direction.toUpperCase()} position closed at $${exitPrice.toFixed(4)}. ${netProfit >= 0 ? "Profit" : "Loss"}: $${netProfit.toFixed(2)}`,
        trade_id: position.trade_id,
      });

    console.log("Position closed. Net P&L:", netProfit.toFixed(2));

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
          ? (netProfit >= (position.profit_target || 0) ? "filled" : "cancelled")
          : null,
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
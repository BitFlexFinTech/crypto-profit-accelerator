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

interface LoopResult {
  success: boolean;
  status: string;
  actions: string[];
  signalsGenerated: number;
  tradesExecuted: number;
  positionsClosed: number;
  errors: Array<{
    symbol?: string;
    exchange?: string;
    errorType?: string;
    message: string;
    suggestion?: string;
  }>;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== RUN TRADING LOOP START ===");
  const startTime = Date.now();
  
  const result: LoopResult = {
    success: true,
    status: "completed",
    actions: [],
    signalsGenerated: 0,
    tradesExecuted: 0,
    positionsClosed: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ============================================
  // CONCURRENCY LOCK: Prevent overlapping executions
  // ============================================
  const lockTimeout = 120000; // 2 minutes max lock time
  const now = new Date();
  let lockAcquired = false;
  
  try {
    // First check current lock state
    const { data: currentLock } = await supabase
      .from("trading_loop_lock")
      .select("*")
      .eq("id", 1)
      .single();
    
    const lockAge = currentLock?.locked_at 
      ? now.getTime() - new Date(currentLock.locked_at).getTime()
      : Infinity;
    
    // Only proceed if not locked or lock expired
    if (currentLock?.locked_at && lockAge < lockTimeout) {
      console.log(`=== LOOP ALREADY RUNNING - SKIPPING (locked ${Math.round(lockAge/1000)}s ago by ${currentLock.locked_by}) ===`);
      result.status = "skipped_concurrent";
      result.actions.push("Another loop is still running");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Acquire lock
    const { error: lockError } = await supabase
      .from("trading_loop_lock")
      .update({ 
        locked_at: now.toISOString(),
        locked_by: `loop-${startTime}`
      })
      .eq("id", 1);
    
    if (lockError) {
      console.warn("Failed to acquire lock:", lockError);
    } else {
      lockAcquired = true;
      console.log(`Lock acquired: loop-${startTime}`);
    }
  } catch (e) {
    console.warn("Lock check failed, proceeding anyway:", e);
  }

  try {

    // STEP 0: AUTO-RECONCILE POSITIONS (detect and fix ghost positions every loop)
    console.log("Running position reconciliation...");
    try {
      const reconcileResponse = await fetch(`${supabaseUrl}/functions/v1/reconcile-positions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ autoFix: true }),
      });
      
      const reconcileResult = await reconcileResponse.json();
      if (reconcileResult.summary?.fixed > 0) {
        result.actions.push(`Auto-fixed ${reconcileResult.summary.fixed} ghost positions`);
      }
    } catch (e) {
      console.warn("Reconciliation failed:", e);
    }

    // STEP 1: Get bot settings
    const { data: settings, error: settingsError } = await supabase
      .from("bot_settings")
      .select("*")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.log("No bot settings found, skipping trading loop");
      result.status = "no_settings";
      result.actions.push("No bot settings configured");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 2: Check if bot is running
    if (!settings.is_bot_running) {
      console.log("Bot is not running, skipping trading loop");
      result.status = "bot_stopped";
      result.actions.push("Bot is stopped");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    result.actions.push("Bot is running");

    // STEP 3: Check daily loss limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: todayStats } = await supabase
      .from("daily_stats")
      .select("net_profit")
      .gte("date", todayStart.toISOString().split("T")[0])
      .single();

    const todayLoss = todayStats?.net_profit && todayStats.net_profit < 0 
      ? Math.abs(todayStats.net_profit) 
      : 0;

    if (todayLoss >= (settings.daily_loss_limit || 100)) {
      console.log("Daily loss limit reached, stopping trading");
      result.status = "daily_limit_reached";
      result.actions.push(`Daily loss limit reached: $${todayLoss.toFixed(2)}`);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 4: Get connected exchanges
    const { data: exchanges, error: exchangesError } = await supabase
      .from("exchanges")
      .select("*")
      .eq("is_connected", true)
      .eq("is_enabled", true);

    if (exchangesError || !exchanges || exchanges.length === 0) {
      console.log("No connected exchanges");
      result.status = "no_exchanges";
      result.actions.push("No exchanges connected");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exchangeNames = exchanges.map(e => e.exchange);
    result.actions.push(`Connected exchanges: ${exchangeNames.join(", ")}`);

    // STEP 5: Get open positions count
    const { data: openPositions, error: positionsError } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "open");

    const openPositionCount = openPositions?.length || 0;
    const maxPositions = settings.max_open_positions || 3;
    
    result.actions.push(`Open positions: ${openPositionCount}/${maxPositions}`);

    // STEP 6: Monitor existing positions for profit targets
    if (openPositions && openPositions.length > 0) {
      console.log(`Checking ${openPositions.length} open positions for profit targets...`);
      
      for (const position of openPositions) {
        // Only check positions with real entry orders
        if (!position.entry_order_id || position.entry_order_id.startsWith("ENTRY-PAPER-")) {
          if (settings.is_paper_trading) {
            // Paper trade - check if profit target hit based on current price
            const profitTarget = position.profit_target || 
              (position.trade_type === "futures" ? settings.futures_profit_target : settings.spot_profit_target);
            
            if (position.unrealized_pnl >= profitTarget) {
              console.log(`Position ${position.symbol} hit paper profit target, closing...`);
              
              try {
                const closeResponse = await fetch(`${supabaseUrl}/functions/v1/close-position`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ positionId: position.id, requireProfit: true }),
                });
                
                const closeResult = await closeResponse.json();
                if (closeResult.success) {
                  result.positionsClosed++;
                  result.actions.push(`Closed paper position ${position.symbol} at profit target`);
                }
              } catch (e) {
                console.error(`Error closing position ${position.id}:`, e);
                result.errors.push({
                  symbol: position.symbol,
                  message: `Failed to close position: ${e instanceof Error ? e.message : 'Unknown error'}`,
                });
              }
            }
          }
          continue; // Skip live TP monitoring for paper trades
        }

        // CASE A: Valid TP order exists - check if filled
        if (position.take_profit_order_id && position.take_profit_status === "pending") {
          console.log(`Checking TP status for ${position.symbol}...`);
          
          try {
            const checkResponse = await fetch(`${supabaseUrl}/functions/v1/close-position`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                positionId: position.id,
                checkTpOnly: true,
                requireProfit: true,
              }),
            });
            
            const checkResult = await checkResponse.json();
            if (checkResult.closed) {
              result.positionsClosed++;
              result.actions.push(`TP filled for ${position.symbol}`);
            }
          } catch (e) {
            console.error(`Error checking TP for ${position.id}:`, e);
          }
        }
        
        // CASE B: STUCK POSITION - TP status pending/error but NO TP order ID
        // Use fallback close: check current price vs profit target
        else if (
          (!position.take_profit_order_id || position.take_profit_order_id === "") &&
          (position.take_profit_status === "pending" || position.take_profit_status === "error")
        ) {
          console.log(`[FALLBACK] Position ${position.symbol} has no TP order - checking market price for close`);
          
          // Fetch current price for this symbol
          try {
            // Get exchange for this position
            const posExchange = exchanges.find(e => e.id === position.exchange_id);
            if (!posExchange) continue;
            
            // Use public price endpoint - Binance ticker
            const tickerSymbol = position.symbol.replace("/", "");
            const priceUrl = posExchange.exchange === "binance"
              ? `https://api.binance.com/api/v3/ticker/price?symbol=${tickerSymbol}`
              : posExchange.exchange === "okx"
                ? `https://www.okx.com/api/v5/market/ticker?instId=${position.symbol.replace("/", "-")}`
                : null;
            
            if (!priceUrl) continue;
            
            const priceRes = await fetch(priceUrl);
            const priceData = await priceRes.json();
            
            let currentPrice = 0;
            if (posExchange.exchange === "binance") {
              currentPrice = parseFloat(priceData?.price || "0");
            } else if (posExchange.exchange === "okx") {
              currentPrice = parseFloat(priceData?.data?.[0]?.last || "0");
            }
            
            if (currentPrice <= 0) {
              console.log(`[FALLBACK] Could not get price for ${position.symbol}`);
              continue;
            }
            
            // Calculate actual PnL with fees
            const tradeType = position.trade_type as "spot" | "futures";
            const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
            const entryFee = position.order_size_usd * feeRate;
            const exitFee = position.order_size_usd * feeRate;
            const fundingFee = tradeType === "futures" ? position.order_size_usd * 0.0001 : 0;
            
            let grossPnL: number;
            if (position.direction === "long") {
              grossPnL = (currentPrice - position.entry_price) * position.quantity * (position.leverage || 1);
            } else {
              grossPnL = (position.entry_price - currentPrice) * position.quantity * (position.leverage || 1);
            }
            
            const netPnL = grossPnL - entryFee - exitFee - fundingFee;
            const profitTarget = position.profit_target || (tradeType === "futures" ? 3.0 : 1.0);
            
            console.log(`[FALLBACK] ${position.symbol}: Price $${currentPrice}, Net PnL $${netPnL.toFixed(4)}, Target $${profitTarget}`);
            
            // Update position with current price/PnL
            await supabase
              .from("positions")
              .update({
                current_price: currentPrice,
                unrealized_pnl: netPnL,
                updated_at: new Date().toISOString(),
              })
              .eq("id", position.id);
            
            // If profit target met, close via market order
            if (netPnL >= profitTarget) {
              console.log(`[FALLBACK] ${position.symbol} HIT PROFIT TARGET - closing at market`);
              
              const closeResponse = await fetch(`${supabaseUrl}/functions/v1/close-position`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                  positionId: position.id, 
                  exitPrice: currentPrice,
                  requireProfit: false, // We already verified profit
                }),
              });
              
              const closeResult = await closeResponse.json();
              if (closeResult.success) {
                result.positionsClosed++;
                result.actions.push(`[FALLBACK] Closed ${position.symbol} at profit $${netPnL.toFixed(2)}`);
              } else {
                console.error(`[FALLBACK] Failed to close ${position.symbol}:`, closeResult.error);
              }
            }
          } catch (e) {
            console.error(`[FALLBACK] Error handling stuck position ${position.id}:`, e);
          }
        }
      }
    }

    // STEP 7: If at max positions, skip analysis
    if (openPositionCount >= maxPositions) {
      console.log("Max positions reached, monitoring only");
      result.status = "max_positions";
      result.actions.push("Max positions reached - monitoring only");
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 8: Analyze pairs for new signals
    console.log("Analyzing pairs for new trading opportunities...");
    
    const mode = exchanges.some(e => e.futures_enabled) ? "both" : "spot";
    
    const analyzeResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-pairs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        exchanges: exchangeNames,
        mode,
        aggressiveness: settings.ai_aggressiveness || "balanced",
      }),
    });

    const analyzeResult = await analyzeResponse.json();
    const signals: TradingSignal[] = analyzeResult?.signals || [];
    
    result.signalsGenerated = signals.length;
    result.actions.push(`Generated ${signals.length} trading signals`);
    
    if (signals.length === 0) {
      console.log("No trading signals generated");
      result.status = "no_signals";
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 9: Execute top signals (up to remaining position slots)
    const slotsAvailable = maxPositions - openPositionCount;
    const signalsToExecute = signals.slice(0, slotsAvailable);
    
    // Determine confidence threshold based on aggressiveness (LOWERED for continuous trading)
    const confidenceThreshold = 
      settings.ai_aggressiveness === "aggressive" ? 0.30 :
      settings.ai_aggressiveness === "conservative" ? 0.55 : 0.35;

    // Lower score threshold for continuous 24/7 trading
    const scoreThreshold = 
      settings.ai_aggressiveness === "aggressive" ? 35 :
      settings.ai_aggressiveness === "conservative" ? 55 : 40;

    for (const signal of signalsToExecute) {
      // Check if signal meets criteria (lowered thresholds for continuous trading)
      if (signal.confidence < confidenceThreshold || signal.score < scoreThreshold) {
        console.log(`Skipping ${signal.symbol}: confidence ${signal.confidence} < ${confidenceThreshold} or score ${signal.score} < ${scoreThreshold}`);
        continue;
      }

      // Find exchange for this signal
      const exchange = exchanges.find(e => e.exchange === signal.exchange && e.is_connected);
      if (!exchange) {
        console.log(`Exchange ${signal.exchange} not found for signal`);
        continue;
      }

      // Check if we already have a position for this (exchange:symbol) combination
      // This allows SIMULTANEOUS positions on Binance AND OKX for the same symbol
      const existingPosition = openPositions?.find(p => 
        p.symbol === signal.symbol && p.exchange_id === exchange.id
      );
      if (existingPosition) {
        console.log(`Already have position in ${signal.symbol} on ${signal.exchange}, skipping`);
        continue;
      }

      // Calculate order size
      const orderSize = Math.min(
        Math.max(settings.min_order_size || 10, 333),
        settings.max_order_size || 1000
      );

      // Determine profit target (UPDATED: $3.00 futures, $1.00 spot)
      const profitTarget = signal.tradeType === "futures"
        ? settings.futures_profit_target || 3.00
        : settings.spot_profit_target || 1.00;

      console.log(`Executing trade: ${signal.direction} ${signal.symbol} on ${signal.exchange}`);
      
      try {
        const tradeResponse = await fetch(`${supabaseUrl}/functions/v1/execute-trade`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            exchangeId: exchange.id,
            symbol: signal.symbol,
            direction: signal.direction,
            tradeType: signal.tradeType,
            orderSizeUsd: orderSize,
            entryPrice: signal.entryPrice,
            profitTarget,
            leverage: signal.tradeType === "futures" ? 10 : 1,
            isPaperTrade: settings.is_paper_trading || false,
            aiScore: signal.score,
            aiReasoning: signal.reasoning,
          }),
        });

        const tradeResult = await tradeResponse.json();
        
        if (tradeResult.success) {
          result.tradesExecuted++;
          result.actions.push(`Executed ${signal.direction} ${signal.symbol} @ $${signal.entryPrice.toFixed(2)}`);
        } else {
          // Capture structured error details
          result.errors.push({
            symbol: signal.symbol,
            exchange: signal.exchange,
            errorType: tradeResult.errorType || 'EXCHANGE_ERROR',
            message: tradeResult.error || 'Unknown error',
            suggestion: tradeResult.suggestion,
          });
          
          // Log specific error type for debugging
          if (tradeResult.errorType === 'API_PERMISSION_ERROR') {
            console.error(`⚠️ API PERMISSION ERROR for ${signal.symbol}: ${tradeResult.error}`);
            console.error(`💡 Suggestion: ${tradeResult.suggestion}`);
          }
        }
      } catch (e) {
        console.error(`Error executing trade for ${signal.symbol}:`, e);
        result.errors.push({
          symbol: signal.symbol,
          exchange: signal.exchange,
          message: `Exception: ${e instanceof Error ? e.message : 'Unknown error'}`,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`=== TRADING LOOP COMPLETE in ${duration}ms ===`);
    console.log(`Signals: ${result.signalsGenerated}, Trades: ${result.tradesExecuted}, Closed: ${result.positionsClosed}`);

    result.status = "completed";
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("=== TRADING LOOP ERROR ===", error);
    result.success = false;
    result.status = "error";
    result.errors.push({
      message: error instanceof Error ? error.message : "Unknown error",
    });
    
    // Release lock on error
    try {
      await supabase
        .from("trading_loop_lock")
        .update({ locked_at: null, locked_by: null })
        .eq("id", 1);
    } catch (e) {
      console.warn("Failed to release lock on error:", e);
    }
    
    return new Response(JSON.stringify(result), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    // Always release lock when done
    try {
      await supabase
        .from("trading_loop_lock")
        .update({ locked_at: null, locked_by: null })
        .eq("id", 1);
      console.log("Lock released");
    } catch (e) {
      console.warn("Failed to release lock:", e);
    }
  }
});

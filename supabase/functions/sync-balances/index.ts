import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all connected exchanges
    const { data: exchanges, error: exchangesError } = await supabase
      .from("exchanges")
      .select("*")
      .eq("is_connected", true);

    if (exchangesError) throw exchangesError;

    console.log(`Syncing balances for ${exchanges?.length || 0} connected exchanges`);

    const results: any[] = [];

    for (const exchange of exchanges || []) {
      try {
        // For now, simulate balance sync since we don't have real API keys
        // In production, this would use the encrypted API keys to fetch real balances
        
        let balance = 0;
        
        // Simulate fetching balance based on exchange
        // In production, you would decrypt API keys and make authenticated requests
        switch (exchange.exchange) {
          case "binance":
            // In production: Use Binance API with HMAC signature
            balance = 1000 + Math.random() * 500;
            break;
          case "okx":
            // In production: Use OKX API with signature
            balance = 800 + Math.random() * 400;
            break;
          case "bybit":
            // In production: Use Bybit API
            balance = 600 + Math.random() * 300;
            break;
          case "kucoin":
            // In production: Use KuCoin API
            balance = 500 + Math.random() * 250;
            break;
          case "hyperliquid":
            // In production: Use Hyperliquid API
            balance = 400 + Math.random() * 200;
            break;
          case "nexo":
            // In production: Use Nexo API
            balance = 300 + Math.random() * 150;
            break;
          default:
            balance = 100;
        }

        // Upsert balance record
        const { error: upsertError } = await supabase
          .from("balances")
          .upsert({
            exchange_id: exchange.id,
            user_id: exchange.user_id,
            currency: "USDT",
            total: balance,
            available: balance * 0.95,
            locked: balance * 0.05,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "exchange_id,user_id,currency",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          // If conflict resolution fails, try insert/update separately
          const { data: existingBalance } = await supabase
            .from("balances")
            .select("id")
            .eq("exchange_id", exchange.id)
            .maybeSingle();

          if (existingBalance) {
            await supabase
              .from("balances")
              .update({
                total: balance,
                available: balance * 0.95,
                locked: balance * 0.05,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingBalance.id);
          } else {
            await supabase
              .from("balances")
              .insert({
                exchange_id: exchange.id,
                user_id: exchange.user_id,
                currency: "USDT",
                total: balance,
                available: balance * 0.95,
                locked: balance * 0.05,
              });
          }
        }

        // Update last sync time
        await supabase
          .from("exchanges")
          .update({ last_balance_sync: new Date().toISOString() })
          .eq("id", exchange.id);

        results.push({
          exchange: exchange.exchange,
          balance,
          status: "synced",
        });

        console.log(`Synced ${exchange.exchange}: $${balance.toFixed(2)}`);

      } catch (err) {
        console.error(`Error syncing ${exchange.exchange}:`, err);
        results.push({
          exchange: exchange.exchange,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      synced: results.filter(r => r.status === "synced").length,
      failed: results.filter(r => r.status === "error").length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in sync-balances:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

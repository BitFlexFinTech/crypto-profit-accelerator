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

interface Mismatch {
  position_id: string;
  symbol: string;
  exchange: string;
  exchange_id: string;
  type: "MISSING" | "QUANTITY_MISMATCH";
  db_quantity: number;
  exchange_balance: number;
  recommended_action: string;
}

// ============================================
// BINANCE - FETCH ALL ASSET BALANCES
// ============================================
async function fetchBinanceBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({ timestamp: timestamp.toString() });
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": credentials.apiKey } }
    );

    if (!response.ok) {
      console.error(`[Binance] Account fetch failed:`, await response.text());
      return {};
    }

    const data = await response.json();
    const balances: Record<string, number> = {};

    for (const balance of data.balances || []) {
      const free = parseFloat(balance.free) || 0;
      if (free > 0.00000001) {
        balances[balance.asset] = free;
      }
    }

    console.log(`[Binance] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[Binance] Balance fetch error:`, error);
    return {};
  }
}

// ============================================
// OKX - FETCH ALL ASSET BALANCES
// ============================================
async function fetchOKXBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
  try {
    const timestamp = new Date().toISOString();
    const preHash = timestamp + "GET" + "/api/v5/account/balance";
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");

    const response = await fetch("https://www.okx.com/api/v5/account/balance", {
      headers: {
        "OK-ACCESS-KEY": credentials.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": credentials.passphrase || "",
      },
    });

    const data = await response.json();
    if (data.code !== "0") {
      console.error(`[OKX] Balance fetch failed:`, data);
      return {};
    }

    const balances: Record<string, number> = {};
    for (const detail of data.data?.[0]?.details || []) {
      const available = parseFloat(detail.availBal) || 0;
      if (available > 0.00000001) {
        balances[detail.ccy] = available;
      }
    }

    console.log(`[OKX] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[OKX] Balance fetch error:`, error);
    return {};
  }
}

// ============================================
// BYBIT - FETCH ALL ASSET BALANCES
// ============================================
async function fetchBybitBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const params = "accountType=UNIFIED";
    const preHash = timestamp + credentials.apiKey + recvWindow + params;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("hex");

    const response = await fetch(
      `https://api.bybit.com/v5/account/wallet-balance?${params}`,
      {
        headers: {
          "X-BAPI-API-KEY": credentials.apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
      }
    );

    const data = await response.json();
    if (data.retCode !== 0) {
      console.error(`[Bybit] Balance fetch failed:`, data);
      return {};
    }

    const balances: Record<string, number> = {};
    for (const coin of data.result?.list?.[0]?.coin || []) {
      const available = parseFloat(coin.walletBalance) || 0;
      if (available > 0.00000001) {
        balances[coin.coin] = available;
      }
    }

    console.log(`[Bybit] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[Bybit] Balance fetch error:`, error);
    return {};
  }
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { autoFix = false } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all open positions
    const { data: positions, error: posError } = await supabase
      .from("positions")
      .select("*, exchanges(*)")
      .eq("status", "open");

    if (posError) throw posError;

    console.log(`[Reconcile] Found ${positions?.length || 0} open positions`);

    // Detect orphaned positions: marked closed but no exit_order_id (never sold)
    const { data: orphanedTrades } = await supabase
      .from("trades")
      .select("id, symbol, status, exit_order_id")
      .eq("status", "closed")
      .is("exit_order_id", null)
      .eq("is_paper_trade", false);
    
    if (orphanedTrades && orphanedTrades.length > 0) {
      console.warn(`[Reconcile] ⚠️ ORPHAN ALERT: ${orphanedTrades.length} trades marked closed but never sold!`);
      for (const orphan of orphanedTrades) {
        console.warn(`[Reconcile] Orphaned: ${orphan.symbol} (trade: ${orphan.id})`);
      }
    }

    if (!positions || positions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: { total_positions: 0, matched: 0, mismatched: 0, fixed: 0, orphaned: orphanedTrades?.length || 0 },
          mismatches: [],
          orphanedTrades: orphanedTrades || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group positions by exchange
    const exchangePositions = new Map<string, typeof positions>();
    for (const pos of positions) {
      const exId = pos.exchange_id || "unknown";
      if (!exchangePositions.has(exId)) {
        exchangePositions.set(exId, []);
      }
      exchangePositions.get(exId)!.push(pos);
    }

    const mismatches: Mismatch[] = [];
    let matched = 0;

    // Process each exchange
    for (const [exchangeId, exPositions] of exchangePositions) {
      const exchange = exPositions[0].exchanges;
      if (!exchange || !exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
        console.log(`[Reconcile] Skipping exchange ${exchangeId} - no credentials`);
        // Treat paper trades as matched
        matched += exPositions.filter(p => p.is_paper_trade).length;
        continue;
      }

      const credentials: ExchangeCredentials = {
        exchange: exchange.exchange,
        apiKey: exchange.api_key_encrypted,
        apiSecret: exchange.api_secret_encrypted,
        passphrase: exchange.passphrase_encrypted || undefined,
      };

      // Fetch balances for this exchange
      let balances: Record<string, number> = {};
      switch (exchange.exchange) {
        case "binance":
          balances = await fetchBinanceBalances(credentials);
          break;
        case "okx":
          balances = await fetchOKXBalances(credentials);
          break;
        case "bybit":
          balances = await fetchBybitBalances(credentials);
          break;
        default:
          console.log(`[Reconcile] Exchange ${exchange.exchange} not supported`);
          continue;
      }

      // Compare each position with exchange balance
      for (const pos of exPositions) {
        if (pos.is_paper_trade) {
          matched++;
          continue;
        }

        // Extract base asset from symbol (e.g., "BTC" from "BTC/USDT")
        const baseAsset = pos.symbol.split("/")[0].toUpperCase();
        const exchangeBalance = balances[baseAsset] || 0;
        const dbQuantity = Number(pos.quantity);

        console.log(`[Reconcile] ${pos.symbol}: DB=${dbQuantity}, Exchange=${exchangeBalance}`);

        // Check for mismatch (allow 10% tolerance for partial fills)
        if (exchangeBalance < dbQuantity * 0.1) {
          // Asset missing or nearly zero
          mismatches.push({
            position_id: pos.id,
            symbol: pos.symbol,
            exchange: exchange.exchange,
            exchange_id: exchangeId,
            type: "MISSING",
            db_quantity: dbQuantity,
            exchange_balance: exchangeBalance,
            recommended_action: "MARK_CLOSED",
          });
        } else if (Math.abs(exchangeBalance - dbQuantity) > dbQuantity * 0.1) {
          // Quantity mismatch
          mismatches.push({
            position_id: pos.id,
            symbol: pos.symbol,
            exchange: exchange.exchange,
            exchange_id: exchangeId,
            type: "QUANTITY_MISMATCH",
            db_quantity: dbQuantity,
            exchange_balance: exchangeBalance,
            recommended_action: "UPDATE_QUANTITY",
          });
        } else {
          matched++;
        }
      }
    }

    let fixed = 0;

    // Auto-fix if requested
    if (autoFix && mismatches.length > 0) {
      for (const mismatch of mismatches) {
        if (mismatch.type === "MISSING") {
          // Mark position as closed
          const { error: updateError } = await supabase
            .from("positions")
            .update({
              status: "closed",
              exit_order_id: "RECONCILED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", mismatch.position_id);

          if (!updateError) {
            // Also update the linked trade if exists
            const { data: pos } = await supabase
              .from("positions")
              .select("trade_id")
              .eq("id", mismatch.position_id)
              .single();

            if (pos?.trade_id) {
              await supabase
                .from("trades")
                .update({
                  status: "closed",
                  exit_order_id: "RECONCILED",
                  closed_at: new Date().toISOString(),
                })
                .eq("id", pos.trade_id);
            }

            fixed++;
            console.log(`[Reconcile] Fixed position ${mismatch.position_id}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_positions: positions.length,
          matched,
          mismatched: mismatches.length,
          fixed,
          orphaned: orphanedTrades?.length || 0,
        },
        mismatches,
        orphanedTrades: orphanedTrades || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[Reconcile] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

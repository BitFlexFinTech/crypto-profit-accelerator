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
// BINANCE - CANCEL ORDER
// ============================================
async function cancelBinanceOrder(credentials: ExchangeCredentials, symbol: string, orderId: string): Promise<boolean> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol: symbol.replace("/", ""),
      orderId: orderId,
      timestamp: timestamp.toString(),
    });
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");

    const response = await fetch(
      `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
      { 
        method: "DELETE",
        headers: { "X-MBX-APIKEY": credentials.apiKey } 
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Binance] Cancel order ${orderId} failed: ${errorText}`);
      return false;
    }

    console.log(`[Binance] Successfully cancelled order ${orderId}`);
    return true;
  } catch (error) {
    console.error(`[Binance] Cancel order error:`, error);
    return false;
  }
}

// ============================================
// OKX - CANCEL ORDER
// ============================================
async function cancelOKXOrder(credentials: ExchangeCredentials, instId: string, orderId: string): Promise<boolean> {
  try {
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      instId: instId.replace("/", "-"),
      ordId: orderId,
    });
    const preHash = timestamp + "POST" + "/api/v5/trade/cancel-order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");

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
      console.log(`[OKX] Cancel order ${orderId} failed:`, data);
      return false;
    }

    console.log(`[OKX] Successfully cancelled order ${orderId}`);
    return true;
  } catch (error) {
    console.error(`[OKX] Cancel order error:`, error);
    return false;
  }
}
// ============================================
// BINANCE - FETCH ALL ASSET BALANCES (SPOT)
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
// BINANCE FUTURES - FETCH OPEN POSITIONS
// ============================================
async function fetchBinanceFuturesPositions(credentials: ExchangeCredentials): Promise<Record<string, { amount: number; direction: "long" | "short" }>> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({ timestamp: timestamp.toString() });
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");

    const response = await fetch(
      `https://fapi.binance.com/fapi/v2/positionRisk?${params}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": credentials.apiKey } }
    );

    if (!response.ok) {
      console.error(`[Binance Futures] Position fetch failed:`, await response.text());
      return {};
    }

    const data = await response.json();
    const positions: Record<string, { amount: number; direction: "long" | "short" }> = {};

    for (const pos of data) {
      const positionAmt = parseFloat(pos.positionAmt) || 0;
      if (Math.abs(positionAmt) > 0.00000001) {
        const symbol = pos.symbol.replace("USDT", "/USDT");
        positions[symbol] = {
          amount: Math.abs(positionAmt),
          direction: positionAmt > 0 ? "long" : "short",
        };
      }
    }

    console.log(`[Binance Futures] Found ${Object.keys(positions).length} open positions`);
    return positions;
  } catch (error) {
    console.error(`[Binance Futures] Position fetch error:`, error);
    return {};
  }
}

// ============================================
// OKX - FETCH ALL ASSET BALANCES (SPOT)
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
// OKX FUTURES/SWAP - FETCH OPEN POSITIONS
// ============================================
async function fetchOKXFuturesPositions(credentials: ExchangeCredentials): Promise<Record<string, { amount: number; direction: "long" | "short" }>> {
  try {
    const timestamp = new Date().toISOString();
    const preHash = timestamp + "GET" + "/api/v5/account/positions?instType=SWAP";
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");

    const response = await fetch("https://www.okx.com/api/v5/account/positions?instType=SWAP", {
      headers: {
        "OK-ACCESS-KEY": credentials.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": credentials.passphrase || "",
      },
    });

    const data = await response.json();
    if (data.code !== "0") {
      console.error(`[OKX Futures] Position fetch failed:`, data);
      return {};
    }

    const positions: Record<string, { amount: number; direction: "long" | "short" }> = {};
    
    for (const pos of data.data || []) {
      const posAmt = parseFloat(pos.pos) || 0;
      if (Math.abs(posAmt) > 0) {
        const symbol = pos.instId.replace("-SWAP", "").replace("-", "/");
        let direction: "long" | "short" = "long";
        if (pos.posSide === "short" || (pos.posSide === "net" && posAmt < 0)) {
          direction = "short";
        }
        positions[symbol] = { amount: Math.abs(posAmt), direction };
      }
    }

    console.log(`[OKX Futures] Found ${Object.keys(positions).length} open positions`);
    return positions;
  } catch (error) {
    console.error(`[OKX Futures] Position fetch error:`, error);
    return {};
  }
}

// OKX SWAP contract sizes for converting contracts to quantity
const OKX_CONTRACT_SIZE: Record<string, number> = {
  'BTC': 0.01, 'ETH': 0.1, 'SOL': 1, 'DOT': 10, 'XRP': 100,
  'DOGE': 1000, 'ADA': 100, 'LINK': 1, 'AVAX': 1, 'MATIC': 100,
  'LTC': 0.1, 'BNB': 0.1, 'ATOM': 1, 'NEAR': 10, 'UNI': 1,
};

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

      // Fetch spot balances AND futures positions for this exchange
      let spotBalances: Record<string, number> = {};
      let futuresPositions: Record<string, { amount: number; direction: "long" | "short" }> = {};
      
      switch (exchange.exchange) {
        case "binance":
          [spotBalances, futuresPositions] = await Promise.all([
            fetchBinanceBalances(credentials),
            fetchBinanceFuturesPositions(credentials),
          ]);
          break;
        case "okx":
          [spotBalances, futuresPositions] = await Promise.all([
            fetchOKXBalances(credentials),
            fetchOKXFuturesPositions(credentials),
          ]);
          break;
        case "bybit":
          spotBalances = await fetchBybitBalances(credentials);
          break;
        default:
          console.log(`[Reconcile] Exchange ${exchange.exchange} not supported`);
          continue;
      }

      // Compare each position with exchange data
      for (const pos of exPositions) {
        if (pos.is_paper_trade) {
          matched++;
          continue;
        }

        const dbQuantity = Number(pos.quantity);
        const baseAsset = pos.symbol.split("/")[0].toUpperCase();

        // FUTURES POSITIONS: Check against futures positions API
        if (pos.trade_type === "futures" || pos.direction === "short") {
          const futuresPos = futuresPositions[pos.symbol];
          
          if (!futuresPos) {
            console.log(`[Reconcile] ${pos.symbol} (${pos.trade_type}/${pos.direction}): NOT FOUND in exchange futures`);
            mismatches.push({
              position_id: pos.id,
              symbol: pos.symbol,
              exchange: exchange.exchange,
              exchange_id: exchangeId,
              type: "MISSING",
              db_quantity: dbQuantity,
              exchange_balance: 0,
              recommended_action: "MARK_CLOSED",
            });
          } else {
            // Check direction matches
            if (futuresPos.direction !== pos.direction) {
              console.log(`[Reconcile] ${pos.symbol}: Direction mismatch - DB=${pos.direction}, Exchange=${futuresPos.direction}`);
              mismatches.push({
                position_id: pos.id,
                symbol: pos.symbol,
                exchange: exchange.exchange,
                exchange_id: exchangeId,
                type: "MISSING",
                db_quantity: dbQuantity,
                exchange_balance: 0,
                recommended_action: "MARK_CLOSED",
              });
            } else {
              // Convert OKX contracts to quantity for comparison
              let exchangeQty = futuresPos.amount;
              if (exchange.exchange === "okx") {
                const contractSize = OKX_CONTRACT_SIZE[baseAsset] || 1;
                exchangeQty = futuresPos.amount * contractSize;
              }
              
              console.log(`[Reconcile] ${pos.symbol} futures: DB=${dbQuantity}, Exchange=${exchangeQty}`);
              
              // Allow 20% tolerance for futures
              if (Math.abs(exchangeQty - dbQuantity) <= dbQuantity * 0.2) {
                matched++;
              } else {
                mismatches.push({
                  position_id: pos.id,
                  symbol: pos.symbol,
                  exchange: exchange.exchange,
                  exchange_id: exchangeId,
                  type: "QUANTITY_MISMATCH",
                  db_quantity: dbQuantity,
                  exchange_balance: exchangeQty,
                  recommended_action: "UPDATE_QUANTITY",
                });
              }
            }
          }
          continue;
        }

        // SPOT POSITIONS: Check against spot balance
        const exchangeBalance = spotBalances[baseAsset] || 0;

        console.log(`[Reconcile] ${pos.symbol} spot: DB=${dbQuantity}, Exchange=${exchangeBalance}`);

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
    let tpOrdersCancelled = 0;

    // Auto-fix if requested
    if (autoFix && mismatches.length > 0) {
      for (const mismatch of mismatches) {
        if (mismatch.type === "MISSING") {
          // STRICT RULE: NEVER auto-close positions - only flag as stuck
          // Positions must ONLY close when profit target is confirmed hit
          console.warn(`[Reconcile] MISSING position ${mismatch.position_id} (${mismatch.symbol}) - flagging as STUCK, NOT closing`);
          
          // Get the position to check for orphaned TP order
          const { data: positionData } = await supabase
            .from("positions")
            .select("*, exchanges(*)")
            .eq("id", mismatch.position_id)
            .single();
          
          // CANCEL ORPHANED TP ORDER to free up locked USDT
          if (positionData?.take_profit_order_id && positionData.exchanges) {
            console.log(`[Reconcile] Cancelling orphaned TP order ${positionData.take_profit_order_id} for ${mismatch.symbol}`);
            
            const credentials: ExchangeCredentials = {
              exchange: positionData.exchanges.exchange,
              apiKey: positionData.exchanges.api_key_encrypted,
              apiSecret: positionData.exchanges.api_secret_encrypted,
              passphrase: positionData.exchanges.passphrase_encrypted || undefined,
            };
            
            let cancelled = false;
            if (credentials.exchange === "binance") {
              cancelled = await cancelBinanceOrder(credentials, mismatch.symbol, positionData.take_profit_order_id);
            } else if (credentials.exchange === "okx") {
              cancelled = await cancelOKXOrder(credentials, mismatch.symbol, positionData.take_profit_order_id);
            }
            
            if (cancelled) {
              tpOrdersCancelled++;
              console.log(`[Reconcile] ✅ Cancelled orphaned TP order for ${mismatch.symbol} - USDT unlocked`);
            }
          }
          
          const { error: updateError } = await supabase
            .from("positions")
            .update({
              status: "orphaned",
              take_profit_status: "cancelled",
              reconciliation_note: `Position not found on ${mismatch.exchange}. Exchange balance: ${mismatch.exchange_balance}. TP order cancelled to free locked funds.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", mismatch.position_id);

          if (!updateError) {
            fixed++;
            console.log(`[Reconcile] Marked position ${mismatch.position_id} as ORPHANED`);
          }
        } else if (mismatch.type === "QUANTITY_MISMATCH") {
          // Auto-update DB quantity to match exchange
          const { error: updateError } = await supabase
            .from("positions")
            .update({
              quantity: mismatch.exchange_balance,
              updated_at: new Date().toISOString(),
            })
            .eq("id", mismatch.position_id);

          if (!updateError) {
            fixed++;
            console.log(`[Reconcile] Synced quantity for ${mismatch.symbol}: ${mismatch.db_quantity} -> ${mismatch.exchange_balance}`);
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
          tpOrdersCancelled,
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

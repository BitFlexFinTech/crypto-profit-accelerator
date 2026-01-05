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

interface VerificationResult {
  position_id: string;
  symbol: string;
  exchange: string;
  trade_type: "spot" | "futures";
  direction: "long" | "short";
  db_quantity: number;
  exchange_quantity: number;
  status: "VERIFIED" | "MISSING" | "QUANTITY_MISMATCH";
  verified_at: string;
}

// ============================================
// BINANCE SPOT - FETCH ALL ASSET BALANCES
// ============================================
async function fetchBinanceSpotBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
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
      console.error(`[Binance Spot] Account fetch failed:`, await response.text());
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

    console.log(`[Binance Spot] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[Binance Spot] Balance fetch error:`, error);
    return {};
  }
}

// ============================================
// BINANCE FUTURES - FETCH ALL OPEN POSITIONS
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
        // Convert symbol like BTCUSDT to BTC/USDT
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
// OKX SPOT - FETCH ALL ASSET BALANCES
// ============================================
async function fetchOKXSpotBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
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
      console.error(`[OKX Spot] Balance fetch failed:`, data);
      return {};
    }

    const balances: Record<string, number> = {};
    for (const detail of data.data?.[0]?.details || []) {
      const available = parseFloat(detail.availBal) || 0;
      if (available > 0.00000001) {
        balances[detail.ccy] = available;
      }
    }

    console.log(`[OKX Spot] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[OKX Spot] Balance fetch error:`, error);
    return {};
  }
}

// ============================================
// OKX FUTURES/SWAP - FETCH ALL OPEN POSITIONS
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
      // OKX returns pos (number of contracts) and posSide (long/short/net)
      const posAmt = parseFloat(pos.pos) || 0;
      if (Math.abs(posAmt) > 0) {
        // Convert instId like BTC-USDT-SWAP to BTC/USDT
        const symbol = pos.instId.replace("-SWAP", "").replace("-", "/");
        
        // Determine direction from posSide or sign of pos
        let direction: "long" | "short" = "long";
        if (pos.posSide === "short" || (pos.posSide === "net" && posAmt < 0)) {
          direction = "short";
        }
        
        positions[symbol] = {
          amount: Math.abs(posAmt), // This is contracts for OKX
          direction,
        };
      }
    }

    console.log(`[OKX Futures] Found ${Object.keys(positions).length} open positions`);
    return positions;
  } catch (error) {
    console.error(`[OKX Futures] Position fetch error:`, error);
    return {};
  }
}

// ============================================
// BYBIT SPOT - FETCH ALL ASSET BALANCES
// ============================================
async function fetchBybitSpotBalances(credentials: ExchangeCredentials): Promise<Record<string, number>> {
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
      console.error(`[Bybit Spot] Balance fetch failed:`, data);
      return {};
    }

    const balances: Record<string, number> = {};
    for (const coin of data.result?.list?.[0]?.coin || []) {
      const available = parseFloat(coin.walletBalance) || 0;
      if (available > 0.00000001) {
        balances[coin.coin] = available;
      }
    }

    console.log(`[Bybit Spot] Found ${Object.keys(balances).length} non-zero balances`);
    return balances;
  } catch (error) {
    console.error(`[Bybit Spot] Balance fetch error:`, error);
    return {};
  }
}

// OKX SWAP contract sizes for converting contracts to quantity
const OKX_CONTRACT_SIZE: Record<string, number> = {
  'BTC': 0.01, 'ETH': 0.1, 'SOL': 1, 'DOT': 10, 'XRP': 100,
  'DOGE': 1000, 'ADA': 100, 'LINK': 1, 'AVAX': 1, 'MATIC': 100,
  'LTC': 0.1, 'BNB': 0.1, 'ATOM': 1, 'NEAR': 10, 'UNI': 1,
  'OP': 10, 'ARB': 10, 'SUI': 10, 'SEI': 100,
};

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { autoClean = false } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all open positions from DB
    const { data: dbPositions, error: posError } = await supabase
      .from("positions")
      .select("*, exchanges(*)")
      .eq("status", "open");

    if (posError) throw posError;

    console.log(`[Verify] Found ${dbPositions?.length || 0} open positions in DB`);

    if (!dbPositions || dbPositions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          positions: [],
          summary: { total: 0, verified: 0, missing: 0, mismatch: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group positions by exchange for batch verification
    const exchangePositions = new Map<string, typeof dbPositions>();
    for (const pos of dbPositions) {
      const exId = pos.exchange_id || "unknown";
      if (!exchangePositions.has(exId)) {
        exchangePositions.set(exId, []);
      }
      exchangePositions.get(exId)!.push(pos);
    }

    const results: VerificationResult[] = [];
    let verified = 0;
    let missing = 0;
    let mismatch = 0;

    // Process each exchange
    for (const [exchangeId, exPositions] of exchangePositions) {
      const exchange = exPositions[0].exchanges;
      if (!exchange || !exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
        console.log(`[Verify] Skipping exchange ${exchangeId} - no credentials`);
        // Paper trades without credentials count as verified
        for (const pos of exPositions) {
          if (pos.is_paper_trade) {
            results.push({
              position_id: pos.id,
              symbol: pos.symbol,
              exchange: exchange?.exchange || "unknown",
              trade_type: pos.trade_type,
              direction: pos.direction,
              db_quantity: Number(pos.quantity),
              exchange_quantity: Number(pos.quantity),
              status: "VERIFIED",
              verified_at: new Date().toISOString(),
            });
            verified++;
          }
        }
        continue;
      }

      const credentials: ExchangeCredentials = {
        exchange: exchange.exchange,
        apiKey: exchange.api_key_encrypted,
        apiSecret: exchange.api_secret_encrypted,
        passphrase: exchange.passphrase_encrypted || undefined,
      };

      // Fetch spot balances and futures positions in parallel
      let spotBalances: Record<string, number> = {};
      let futuresPositions: Record<string, { amount: number; direction: "long" | "short" }> = {};

      switch (exchange.exchange) {
        case "binance":
          [spotBalances, futuresPositions] = await Promise.all([
            fetchBinanceSpotBalances(credentials),
            fetchBinanceFuturesPositions(credentials),
          ]);
          break;
        case "okx":
          [spotBalances, futuresPositions] = await Promise.all([
            fetchOKXSpotBalances(credentials),
            fetchOKXFuturesPositions(credentials),
          ]);
          break;
        case "bybit":
          spotBalances = await fetchBybitSpotBalances(credentials);
          // Bybit futures would need separate implementation
          break;
        default:
          console.log(`[Verify] Exchange ${exchange.exchange} not supported`);
          continue;
      }

      // Verify each position
      for (const pos of exPositions) {
        if (pos.is_paper_trade) {
          results.push({
            position_id: pos.id,
            symbol: pos.symbol,
            exchange: exchange.exchange,
            trade_type: pos.trade_type,
            direction: pos.direction,
            db_quantity: Number(pos.quantity),
            exchange_quantity: Number(pos.quantity),
            status: "VERIFIED",
            verified_at: new Date().toISOString(),
          });
          verified++;
          continue;
        }

        const dbQuantity = Number(pos.quantity);
        let exchangeQuantity = 0;
        let posStatus: "VERIFIED" | "MISSING" | "QUANTITY_MISMATCH" = "MISSING";

        if (pos.trade_type === "futures" || pos.direction === "short") {
          // Futures position - check in futures positions map
          const futuresPos = futuresPositions[pos.symbol];
          if (futuresPos) {
            // For OKX, convert contracts to quantity
            if (exchange.exchange === "okx") {
              const baseAsset = pos.symbol.split("/")[0].toUpperCase();
              const contractSize = OKX_CONTRACT_SIZE[baseAsset] || 1;
              exchangeQuantity = futuresPos.amount * contractSize;
            } else {
              exchangeQuantity = futuresPos.amount;
            }
            
            // Check direction matches
            if (futuresPos.direction !== pos.direction) {
              console.log(`[Verify] ${pos.symbol}: Direction mismatch - DB=${pos.direction}, Exchange=${futuresPos.direction}`);
              posStatus = "MISSING";
            } else {
              // Allow 20% tolerance for quantity
              const tolerance = dbQuantity * 0.2;
              if (Math.abs(exchangeQuantity - dbQuantity) <= tolerance) {
                posStatus = "VERIFIED";
              } else {
                posStatus = "QUANTITY_MISMATCH";
              }
            }
          } else {
            console.log(`[Verify] ${pos.symbol}: Not found in futures positions`);
            posStatus = "MISSING";
          }
        } else {
          // Spot position - check in spot balances
          const baseAsset = pos.symbol.split("/")[0].toUpperCase();
          exchangeQuantity = spotBalances[baseAsset] || 0;

          console.log(`[Verify] ${pos.symbol}: DB=${dbQuantity}, Exchange=${exchangeQuantity}`);

          // Allow 20% tolerance
          if (exchangeQuantity >= dbQuantity * 0.1) {
            if (Math.abs(exchangeQuantity - dbQuantity) <= dbQuantity * 0.2) {
              posStatus = "VERIFIED";
            } else {
              posStatus = "QUANTITY_MISMATCH";
            }
          } else {
            posStatus = "MISSING";
          }
        }

        results.push({
          position_id: pos.id,
          symbol: pos.symbol,
          exchange: exchange.exchange,
          trade_type: pos.trade_type,
          direction: pos.direction,
          db_quantity: dbQuantity,
          exchange_quantity: exchangeQuantity,
          status: posStatus,
          verified_at: new Date().toISOString(),
        });

        if (posStatus === "VERIFIED") verified++;
        else if (posStatus === "MISSING") missing++;
        else mismatch++;
      }
    }

    // Auto-clean phantom positions if requested
    let cleaned = 0;
    if (autoClean && missing > 0) {
      const phantomPositions = results.filter(r => r.status === "MISSING");
      for (const phantom of phantomPositions) {
        console.log(`[Verify] Auto-cleaning phantom position: ${phantom.symbol}`);
        
        const { error: updateError } = await supabase
          .from("positions")
          .update({
            status: "closed",
            exit_order_id: "PHANTOM_CLEANED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", phantom.position_id);

        if (!updateError) {
          // Also close linked trade
          const { data: pos } = await supabase
            .from("positions")
            .select("trade_id")
            .eq("id", phantom.position_id)
            .single();

          if (pos?.trade_id) {
            await supabase
              .from("trades")
              .update({
                status: "closed",
                exit_order_id: "PHANTOM_CLEANED",
                closed_at: new Date().toISOString(),
                net_profit: 0,
                gross_profit: 0,
              })
              .eq("id", pos.trade_id);
          }

          cleaned++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        positions: results,
        summary: {
          total: results.length,
          verified,
          missing,
          mismatch,
          cleaned,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[Verify] Error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

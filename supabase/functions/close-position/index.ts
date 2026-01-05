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

interface OrderResult {
  success: boolean;
  orderId: string;
  executedPrice?: number;
  error?: string;
  noBalance?: boolean;
}

// Format symbol for each exchange
function formatSymbol(symbol: string, exchange: string, tradeType: "spot" | "futures"): string {
  const base = symbol.replace("/", "");
  switch (exchange) {
    case "binance":
      return base;
    case "okx":
      if (tradeType === "futures") {
        return symbol.replace("/", "-") + "-SWAP";
      }
      return symbol.replace("/", "-");
    case "bybit":
      return base;
    default:
      return base;
  }
}

// LOT_SIZE stepSize precision for common trading pairs
const QUANTITY_PRECISION: Record<string, number> = {
  // High-value coins - more decimals
  'BTC': 5,    // stepSize: 0.00001
  'ETH': 4,    // stepSize: 0.0001
  // Mid-value coins
  'SOL': 3,    // stepSize: 0.001
  'BNB': 3,    // stepSize: 0.001
  'LTC': 3,    // stepSize: 0.001
  'AVAX': 2,   // stepSize: 0.01
  'LINK': 2,   // stepSize: 0.01
  'UNI': 2,    // stepSize: 0.01
  'AAVE': 2,   // stepSize: 0.01
  'DOT': 1,    // stepSize: 0.1
  'ATOM': 1,   // stepSize: 0.1
  'NEAR': 1,   // stepSize: 0.1
  'OP': 1,     // stepSize: 0.1
  'ARB': 1,    // stepSize: 0.1
  'XRP': 1,    // stepSize: 0.1
  'MATIC': 0,  // stepSize: 1
  'ADA': 0,    // stepSize: 1
  'DOGE': 0,   // stepSize: 1
  'SHIB': 0,   // stepSize: 1
  'BONK': 0,   // stepSize: 1
  'PEPE': 0,   // stepSize: 1
  'FLOKI': 0,  // stepSize: 1
  'TRX': 0,    // stepSize: 1
  'SUI': 0,    // stepSize: 1
  'SEI': 0,    // stepSize: 1
};

// OKX SWAP contract sizes (1 contract = X base asset)
// For OKX futures, sz is the NUMBER OF CONTRACTS, not quantity
const OKX_CONTRACT_SIZE: Record<string, number> = {
  'BTC': 0.01,   // 1 contract = 0.01 BTC
  'ETH': 0.1,    // 1 contract = 0.1 ETH
  'SOL': 1,      // 1 contract = 1 SOL
  'DOT': 10,     // 1 contract = 10 DOT
  'XRP': 100,    // 1 contract = 100 XRP
  'DOGE': 1000,  // 1 contract = 1000 DOGE
  'ADA': 100,    // 1 contract = 100 ADA
  'LINK': 1,     // 1 contract = 1 LINK
  'AVAX': 1,     // 1 contract = 1 AVAX
  'MATIC': 100,  // 1 contract = 100 MATIC
  'LTC': 0.1,    // 1 contract = 0.1 LTC
  'BNB': 0.1,    // 1 contract = 0.1 BNB
  'ATOM': 1,     // 1 contract = 1 ATOM
  'NEAR': 10,    // 1 contract = 10 NEAR
  'UNI': 1,      // 1 contract = 1 UNI
  'OP': 10,      // 1 contract = 10 OP
  'ARB': 10,     // 1 contract = 10 ARB
  'SUI': 10,     // 1 contract = 10 SUI
  'SEI': 100,    // 1 contract = 100 SEI
};

// Format quantity to proper precision for exchange LOT_SIZE filter
function formatQuantity(quantity: number, symbol: string, exchange?: string, tradeType?: "spot" | "futures"): string {
  // Extract base asset from symbol (e.g., "BTC" from "BTC/USDT" or "BTCUSDT")
  const baseAsset = symbol.replace(/[-\/]?(USDT|USDC|BUSD|USD).*$/i, '').toUpperCase();
  
  // OKX SWAP contracts: sz is number of contracts, not raw quantity
  if (exchange === 'okx' && tradeType === 'futures') {
    const contractSize = OKX_CONTRACT_SIZE[baseAsset] ?? 1;
    const numContracts = Math.floor(quantity / contractSize);
    console.log(`[formatQuantity] OKX SWAP EXIT ${baseAsset}: ${quantity} / ${contractSize} = ${numContracts} contracts`);
    return numContracts.toString();
  }
  
  // Get precision from mapping, default to 2 decimals for unknown assets
  const precision = QUANTITY_PRECISION[baseAsset] ?? 2;
  
  // Round DOWN to avoid exceeding available balance
  const multiplier = Math.pow(10, precision);
  const roundedQty = Math.floor(quantity * multiplier) / multiplier;
  
  console.log(`[formatQuantity] ${symbol} -> ${baseAsset}: ${quantity} -> ${roundedQty} (precision: ${precision})`);
  
  return roundedQty.toFixed(precision);
}

// ============================================
// BINANCE - CANCEL ORDER
// ============================================
async function cancelBinanceOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string,
  tradeType: "spot" | "futures"
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(symbol, "binance", tradeType);
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      orderId: orderId,
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    const baseUrl = tradeType === "futures"
      ? "https://fapi.binance.com/fapi/v1/order"
      : "https://api.binance.com/api/v3/order";
    
    console.log(`[Binance] Cancelling order: ${orderId} for ${formattedSymbol}`);
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      if (data.code === -2011) {
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
// BINANCE - PLACE MARKET ORDER (EXIT)
// ============================================
async function placeBinanceMarketOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<OrderResult> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(symbol, "binance", tradeType);
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      side: side,
      type: "MARKET",
      quantity: formatQuantity(quantity, symbol),
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    const baseUrl = tradeType === "futures"
      ? "https://fapi.binance.com/fapi/v1/order"
      : "https://api.binance.com/api/v3/order";
    
    console.log(`[Binance] Placing EXIT MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Binance] EXIT order failed:`, data);
      return { success: false, orderId: "", error: data.msg || `API error: ${response.status}` };
    }
    
    let executedPrice = 0;
    if (data.fills && data.fills.length > 0) {
      let totalCost = 0;
      let totalQty = 0;
      for (const fill of data.fills) {
        const fillQty = parseFloat(fill.qty);
        const fillPrice = parseFloat(fill.price);
        totalCost += fillQty * fillPrice;
        totalQty += fillQty;
      }
      executedPrice = totalCost / totalQty;
    } else {
      executedPrice = parseFloat(data.avgPrice) || parseFloat(data.price) || 0;
    }
    
    console.log(`[Binance] EXIT order filled: ${data.orderId} @ ${executedPrice}`);
    return { success: true, orderId: data.orderId.toString(), executedPrice };
  } catch (error) {
    console.error(`[Binance] EXIT order exception:`, error);
    return { success: false, orderId: "", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// OKX - CANCEL ORDER
// ============================================
async function cancelOKXOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string,
  tradeType: "spot" | "futures"
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(symbol, "okx", tradeType);
    
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
// OKX - PLACE MARKET ORDER (EXIT)
// ============================================
async function placeOKXMarketOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<OrderResult> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(symbol, "okx", tradeType);
    
    const orderPayload: Record<string, unknown> = {
      instId: formattedSymbol,
      tdMode: tradeType === "futures" ? "cross" : "cash",
      side: side.toLowerCase(),
      ordType: "market",
      sz: formatQuantity(quantity, symbol, "okx", tradeType),
    };

    // Critical for futures exits: ensure we only reduce an existing position.
    // Without reduceOnly, OKX may treat this as opening/adding, which can fail with
    // "Insufficient USDT margin" even though a close should succeed.
    if (tradeType === "futures") {
      orderPayload.reduceOnly = true;
    }

    const body = JSON.stringify(orderPayload);
    
    const preHash = timestamp + "POST" + "/api/v5/trade/order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX] Placing EXIT MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
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
      console.error(`[OKX] EXIT order failed:`, data);

      // OKX often returns a generic msg like "All operations failed".
      // Prefer the per-operation error details when available.
      const sCode = data.data?.[0]?.sCode as string | undefined;
      const sMsg = data.data?.[0]?.sMsg as string | undefined;
      const detailedMsg = sMsg || data.msg || `API error: ${data.code}`;

      // Insufficient balance error (51008) - asset may have been sold by TP order
      const normalized = detailedMsg.toLowerCase();
      if (sCode === "51008" || normalized.includes("insufficient")) {
        return {
          success: false,
          orderId: "",
          error: detailedMsg,
          noBalance: true,
        };
      }

      return { success: false, orderId: "", error: detailedMsg };
    }
    
    const orderId = data.data?.[0]?.ordId || "";
    const avgPx = parseFloat(data.data?.[0]?.avgPx || "0");
    
    console.log(`[OKX] EXIT order filled: ${orderId} @ ${avgPx}`);
    return { success: true, orderId, executedPrice: avgPx };
  } catch (error) {
    console.error(`[OKX] EXIT order exception:`, error);
    return { success: false, orderId: "", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// BYBIT - CANCEL ORDER
// ============================================
async function cancelBybitOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  orderId: string,
  tradeType: "spot" | "futures"
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const formattedSymbol = formatSymbol(symbol, "bybit", tradeType);
    
    const body = JSON.stringify({
      category: tradeType === "futures" ? "linear" : "spot",
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
// BYBIT - PLACE MARKET ORDER (EXIT)
// ============================================
async function placeBybitMarketOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<OrderResult> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const formattedSymbol = formatSymbol(symbol, "bybit", tradeType);
    
    const body = JSON.stringify({
      category: tradeType === "futures" ? "linear" : "spot",
      symbol: formattedSymbol,
      side: side === "BUY" ? "Buy" : "Sell",
      orderType: "Market",
      qty: formatQuantity(quantity, symbol),
    });
    
    const preHash = timestamp + credentials.apiKey + recvWindow + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("hex");
    
    console.log(`[Bybit] Placing EXIT MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
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
      console.error(`[Bybit] EXIT order failed:`, data);
      return { success: false, orderId: "", error: data.retMsg || `API error: ${data.retCode}` };
    }
    
    const orderId = data.result?.orderId || "";
    const avgPrice = parseFloat(data.result?.avgPrice || "0");
    
    console.log(`[Bybit] EXIT order filled: ${orderId} @ ${avgPrice}`);
    return { success: true, orderId, executedPrice: avgPrice };
  } catch (error) {
    console.error(`[Bybit] EXIT order exception:`, error);
    return { success: false, orderId: "", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// UNIFIED CANCEL ORDER
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
  tradeType: "spot" | "futures",
  isPaperTrade: boolean
): Promise<{ success: boolean; error?: string }> {
  console.log(`[${exchange.exchange}] Cancelling order: ${orderId}`);
  
  if (isPaperTrade || orderId.startsWith("TP-PAPER-") || orderId.startsWith("ENTRY-PAPER-")) {
    console.log(`[PAPER] Simulated cancel for ${orderId}`);
    return { success: true };
  }
  
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
      return await cancelBinanceOrder(credentials, symbol, orderId, tradeType);
    case "okx":
      return await cancelOKXOrder(credentials, symbol, orderId, tradeType);
    case "bybit":
      return await cancelBybitOrder(credentials, symbol, orderId, tradeType);
    default:
      console.log(`[${exchange.exchange}] Exchange not supported for live cancel`);
      return { success: true };
  }
}

// ============================================
// BINANCE - GET ASSET BALANCE
// ============================================
async function getBinanceBalance(
  credentials: ExchangeCredentials,
  asset: string,
  tradeType: "spot" | "futures"
): Promise<{ balance: number; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = new URLSearchParams({ timestamp: timestamp.toString() });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    const baseUrl = tradeType === "futures"
      ? "https://fapi.binance.com/fapi/v2/balance"
      : "https://api.binance.com/api/v3/account";
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "GET",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { balance: 0, error: data.msg || `API error: ${response.status}` };
    }
    
    if (tradeType === "futures") {
      const assetBalance = data.find((b: { asset: string }) => b.asset === asset);
      return { balance: parseFloat(assetBalance?.availableBalance || "0") };
    } else {
      const assetBalance = data.balances?.find((b: { asset: string }) => b.asset === asset);
      return { balance: parseFloat(assetBalance?.free || "0") };
    }
  } catch (error) {
    return { balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================
// UNIFIED EXIT ORDER (MARKET)
// ============================================
async function placeExitOrder(
  exchange: { 
    exchange: string; 
    api_key_encrypted: string | null; 
    api_secret_encrypted: string | null;
    passphrase_encrypted: string | null;
  },
  symbol: string,
  side: string,
  quantity: number,
  tradeType: "spot" | "futures",
  isPaperTrade: boolean,
  currentPrice: number
): Promise<{ orderId: string; executedPrice: number; isLive: boolean; error?: string; noBalance?: boolean }> {
  console.log(`[${exchange.exchange}] Exit order: ${side} ${quantity} ${symbol} (Paper: ${isPaperTrade})`);
  
  if (isPaperTrade) {
    const slippage = (Math.random() * 0.0002 + 0.0001);
    const simulatedPrice = side === "SELL" 
      ? currentPrice * (1 - slippage)
      : currentPrice * (1 + slippage);
    console.log(`[PAPER] Simulated exit at ${simulatedPrice.toFixed(6)}`);
    return { 
      orderId: `EXIT-PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      executedPrice: simulatedPrice,
      isLive: false
    };
  }
  
  if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
    console.error(`[${exchange.exchange}] NO API CREDENTIALS - CANNOT EXECUTE LIVE EXIT`);
    return { 
      orderId: "",
      executedPrice: currentPrice,
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
  
  // CRITICAL: Check actual balance before attempting to sell
  if (exchange.exchange === "binance" && side === "SELL") {
    const baseAsset = symbol.replace(/[-\/]?(USDT|USDC|BUSD|USD).*$/i, '').toUpperCase();
    const balanceResult = await getBinanceBalance(credentials, baseAsset, tradeType);
    
    console.log(`[Binance] Balance check: ${baseAsset} = ${balanceResult.balance}, need ${quantity}`);
    
    // If we have less than 10% of needed, treat as no balance (already sold)
    if (balanceResult.balance < quantity * 0.1) {
      console.warn(`[Binance] ASSET GONE: Have ${balanceResult.balance}, need ${quantity}`);
      return {
        orderId: "ALREADY-CLOSED-NO-BALANCE",
        executedPrice: currentPrice,
        isLive: false,
        noBalance: true,
        error: `No ${baseAsset} balance found - position may have been closed manually on exchange`
      };
    }
    
    // ALWAYS use actual balance if it's less than DB quantity (handles rounding/partial fills)
    if (balanceResult.balance < quantity) {
      console.log(`[Binance] Using actual balance: ${balanceResult.balance} instead of DB quantity: ${quantity}`);
      quantity = balanceResult.balance;
    }
  }
  
  let result: OrderResult;
  
  switch (exchange.exchange) {
    case "binance":
      result = await placeBinanceMarketOrder(credentials, symbol, side, quantity, tradeType);
      break;
    case "okx":
      result = await placeOKXMarketOrder(credentials, symbol, side, quantity, tradeType);
      break;
    case "bybit":
      result = await placeBybitMarketOrder(credentials, symbol, side, quantity, tradeType);
      break;
    default:
      return { 
        orderId: "", 
        executedPrice: currentPrice, 
        isLive: false, 
        error: `Exchange ${exchange.exchange} not supported` 
      };
  }
  
  if (!result.success) {
    console.error(`[${exchange.exchange}] EXIT ORDER FAILED: ${result.error}`);
    return {
      orderId: "",
      executedPrice: currentPrice,
      isLive: false,
      error: result.error,
      noBalance: result.noBalance,
    };
  }
  
  return { 
    orderId: result.orderId, 
    executedPrice: result.executedPrice || currentPrice,
    isLive: true 
  };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { positionId, exitPrice: requestedExitPrice, requireProfit = false } = await req.json();
    
    console.log("=== CLOSE POSITION REQUEST ===");
    console.log("Position ID:", positionId);
    console.log("Require Profit:", requireProfit);

    // Atomically update position to 'closing' to prevent race conditions
    // Use intermediate status - only set 'closed' AFTER successful exit order
    const { data: position, error: claimError } = await supabase
      .from("positions")
      .update({ status: "closing" })
      .eq("id", positionId)
      .eq("status", "open")
      .select("*")
      .single();

    if (claimError || !position) {
      // Check if already closing or closed
      const { data: existingPos } = await supabase
        .from("positions")
        .select("status")
        .eq("id", positionId)
        .single();
      
      console.log("Position already closing/closed or not found:", positionId, "status:", existingPos?.status);
      return new Response(JSON.stringify({
        success: true,
        alreadyClosed: true,
        message: "Position was already closed or is being closed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Position claimed:", position.symbol, position.direction, "Paper:", position.is_paper_trade);

    // Get exchange info
    const { data: exchange } = await supabase
      .from("exchanges")
      .select("*")
      .eq("id", position.exchange_id)
      .single();

    if (!exchange) {
      throw new Error("Exchange not found");
    }

    const tradeType = position.trade_type as "spot" | "futures";
    const isPaperTrade = position.is_paper_trade || false;

    // ============================================
    // STEP 1: CANCEL PENDING TP ORDER
    // ============================================
    let tpAlreadyFilled = false;
    
    if (position.take_profit_order_id && position.take_profit_status === "pending") {
      console.log("=== STEP 1: CANCELLING TP ORDER ===");
      console.log("TP Order ID:", position.take_profit_order_id);
      
      const cancelResult = await cancelExchangeOrder(
        exchange, 
        position.symbol,
        position.take_profit_order_id,
        tradeType,
        isPaperTrade
      );
      
      if (!cancelResult.success) {
        console.warn(`Failed to cancel TP order: ${cancelResult.error}`);
        
        // Check if TP order was already filled on exchange
        if (cancelResult.error?.includes("filled") || cancelResult.error?.includes("All operations failed")) {
          console.log("=== TP ORDER MAY HAVE ALREADY FILLED ===");
          tpAlreadyFilled = true;
          // Use TP price as exit price if available
          if (position.take_profit_price) {
            console.log(`Using TP price as exit price: ${position.take_profit_price}`);
          }
        }
      }
    }

    // ============================================
    // STEP 1.5: VERIFY PROFIT TARGET BEFORE EXIT (STRICT RULE)
    // For LIVE trades: ALWAYS enforce profit target, ignore requireProfit flag
    // This is a safety measure to prevent any caller from closing live trades at a loss
    // ============================================
    const isLiveTrade = !isPaperTrade && position.is_live === true;
    const shouldEnforceProfitTarget = requireProfit || isLiveTrade;
    
    if (shouldEnforceProfitTarget) {
      const currentPrice = requestedExitPrice || position.current_price || position.entry_price;
      const profitTarget = position.profit_target || (tradeType === "futures" ? 3.0 : 1.0);
      
      // Calculate actual PnL with fees (same formula as final calculation)
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
      
      const actualNetPnL = grossPnL - entryFee - exitFee - fundingFee;
      
      console.log(`=== PROFIT CHECK (Live: ${isLiveTrade}, RequireProfit: ${requireProfit}) ===`);
      console.log(`Entry: $${position.entry_price}, Current: $${currentPrice}`);
      console.log(`Gross PnL: $${grossPnL.toFixed(4)}, Fees: $${(entryFee + exitFee + fundingFee).toFixed(4)}`);
      console.log(`Actual Net PnL: $${actualNetPnL.toFixed(4)}, Required: $${profitTarget.toFixed(2)}`);
      
      if (actualNetPnL < profitTarget) {
        console.log("=== PROFIT TARGET NOT MET - REVERTING TO OPEN ===");
        
        // Revert position back to open with current calculated PnL
        await supabase
          .from("positions")
          .update({ 
            status: "open",
            current_price: currentPrice,
            unrealized_pnl: actualNetPnL,
          })
          .eq("id", positionId);
        
        return new Response(JSON.stringify({
          success: false,
          blocked: true,
          message: `Waiting for profit: Need +$${profitTarget.toFixed(2)}, currently at ${actualNetPnL >= 0 ? '+' : ''}$${actualNetPnL.toFixed(4)}`,
          profitRequired: profitTarget,
          currentPnL: actualNetPnL,
          currentPrice,
          entryPrice: position.entry_price,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log("=== PROFIT TARGET MET - PROCEEDING WITH CLOSE ===");
    }

    // ============================================
    // STEP 2: PLACE EXIT ORDER ON EXCHANGE
    // ============================================
    console.log("=== STEP 2: PLACING EXIT ORDER ===");
    
    // Determine exit side (opposite of entry)
    const exitSide = position.direction === "long" ? "SELL" : "BUY";
    const currentPrice = requestedExitPrice || position.current_price || position.entry_price;
    
    const exitResult = await placeExitOrder(
      exchange,
      position.symbol,
      exitSide,
      position.quantity,
      tradeType,
      isPaperTrade,
      currentPrice
    );
    
    // SPECIAL CASE: If TP order already filled AND exit fails with no balance,
    // the TP order successfully closed the position on the exchange
    if (exitResult.noBalance && tpAlreadyFilled) {
      console.log("=== TP ORDER ALREADY FILLED - CLOSING POSITION AS SUCCESS ===");
      const now = new Date().toISOString();
      
      // Use TP price as exit price since that's where it actually filled
      const tpExitPrice = position.take_profit_price || currentPrice;
      
      // Calculate P&L using TP price
      const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
      const exitFee = position.order_size_usd * feeRate;
      const entryFee = position.order_size_usd * feeRate;
      const fundingFee = tradeType === "futures" ? position.order_size_usd * 0.0001 : 0;
      
      let grossProfit: number;
      if (position.direction === "long") {
        grossProfit = (tpExitPrice - position.entry_price) * position.quantity * (position.leverage || 1);
      } else {
        grossProfit = (position.entry_price - tpExitPrice) * position.quantity * (position.leverage || 1);
      }
      
      const netProfit = grossProfit - entryFee - exitFee - fundingFee;
      
      console.log(`TP Fill P&L: Exit=${tpExitPrice}, Gross=${grossProfit.toFixed(4)}, Net=${netProfit.toFixed(4)}`);
      
      // Update trade record
      await supabase
        .from("trades")
        .update({
          exit_price: tpExitPrice,
          exit_fee: exitFee,
          exit_order_id: position.take_profit_order_id,
          funding_fee: fundingFee,
          gross_profit: grossProfit,
          net_profit: netProfit,
          status: "closed",
          closed_at: now,
          tp_filled_at: now,
        })
        .eq("id", position.trade_id);
      
      // Update position record
      await supabase
        .from("positions")
        .update({
          current_price: tpExitPrice,
          exit_order_id: position.take_profit_order_id,
          unrealized_pnl: netProfit,
          status: "closed",
          take_profit_status: "filled",
          take_profit_filled_at: now,
          updated_at: now,
          reconciliation_note: "TP order filled on exchange - detected via no balance on manual close attempt",
        })
        .eq("id", positionId);
      
      return new Response(JSON.stringify({
        success: true,
        tpFilled: true,
        message: "Position was already closed by Take Profit order on exchange",
        exitPrice: tpExitPrice,
        netProfit,
        grossProfit,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // STRICT RULE: NEVER auto-close positions even if no balance (and TP didn't fill)
    // Positions must ONLY close when profit target is hit
    // Flag as stuck for manual review instead
    if (exitResult.noBalance) {
      console.warn("=== NO BALANCE (TP NOT FILLED) - FLAGGING AS STUCK ===");
      const now = new Date().toISOString();
      
      // Revert to open but flag as stuck - DO NOT CLOSE
      await supabase
        .from("positions")
        .update({ 
          status: "open",
          take_profit_status: "stuck",
          reconciliation_note: `Cannot close: Asset not found on exchange (${exitResult.error || 'no balance'}). Needs manual verification.`,
          updated_at: now,
        })
        .eq("id", positionId);
      
      return new Response(JSON.stringify({
        success: false,
        blocked: true,
        stuck: true,
        message: "Position flagged as STUCK - asset not found on exchange. Manual verification required.",
        noBalance: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // For live trades, if exit fails, revert position to open
    if (!exitResult.orderId && exitResult.error && !exitResult.noBalance) {
      console.error("=== EXIT FAILED - REVERTING POSITION TO OPEN ===");
      await supabase
        .from("positions")
        .update({ 
          status: "open",
          take_profit_status: position.take_profit_order_id ? "pending" : null,
        })
        .eq("id", positionId);
      
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to place exit order: ${exitResult.error}`,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const exitPrice = exitResult.executedPrice;
    const exitOrderId = exitResult.orderId;
    
    console.log(`Exit order result: ID=${exitOrderId}, Price=${exitPrice}, Live=${exitResult.isLive}`);

    // ============================================
    // STEP 3: CALCULATE P&L
    // ============================================
    const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
    const exitFee = position.order_size_usd * feeRate;
    
    const { data: trade } = await supabase
      .from("trades")
      .select("entry_fee")
      .eq("id", position.trade_id)
      .single();
    
    const entryFee = trade?.entry_fee || position.order_size_usd * feeRate;

    let grossProfit: number;
    if (position.direction === "long") {
      grossProfit = (exitPrice - position.entry_price) * position.quantity * (position.leverage || 1);
    } else {
      grossProfit = (position.entry_price - exitPrice) * position.quantity * (position.leverage || 1);
    }

    const fundingFee = tradeType === "futures" ? position.order_size_usd * 0.0001 : 0;
    const netProfit = grossProfit - entryFee - exitFee - fundingFee;

    console.log(`P&L: Gross=${grossProfit.toFixed(2)}, Fees=${(entryFee + exitFee + fundingFee).toFixed(2)}, Net=${netProfit.toFixed(2)}`);

    // ============================================
    // STEP 4: VERIFY PROFIT REQUIREMENT
    // ============================================
    if (requireProfit && netProfit < 0) {
      // Revert position to open - exit order already placed, we need to re-enter
      // For simplicity, we'll log this but proceed with close
      // In production, you'd want to handle this more carefully
      console.warn("WARNING: Closing at a loss but requireProfit=true. Proceeding anyway since exit order was already placed.");
    }

    const tpFilled = netProfit >= (position.profit_target || 0);
    const now = new Date().toISOString();

    // ============================================
    // STEP 5: UPDATE DATABASE RECORDS
    // ============================================
    const { error: updateTradeError } = await supabase
      .from("trades")
      .update({
        exit_price: exitPrice,
        exit_fee: exitFee,
        exit_order_id: exitOrderId,
        funding_fee: fundingFee,
        gross_profit: grossProfit,
        net_profit: netProfit,
        status: "closed",
        closed_at: now,
        tp_filled_at: tpFilled ? now : null,
      })
      .eq("id", position.trade_id);

    if (updateTradeError) throw updateTradeError;

    const { error: updatePositionError } = await supabase
      .from("positions")
      .update({
        current_price: exitPrice,
        exit_order_id: exitOrderId,
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

    // ============================================
    // STEP 6: UPDATE DAILY STATS
    // ============================================
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

    // ============================================
    // STEP 7: CREATE NOTIFICATION
    // ============================================
    const profitEmoji = netProfit > 0 ? "🎉" : "📉";
    const liveIndicator = exitResult.isLive ? "🔴" : "📝";
    await supabase
      .from("notifications")
      .insert({
        user_id: position.user_id,
        type: netProfit > 0 ? "profit_target_hit" : "trade_closed",
        title: `${liveIndicator} ${profitEmoji} ${position.symbol} Closed`,
        message: `${position.direction.toUpperCase()} closed at $${exitPrice.toFixed(4)}. ${netProfit >= 0 ? "Profit" : "Loss"}: $${netProfit.toFixed(2)}${tpFilled ? " (TP Hit!)" : ""}. Exit Order: ${exitOrderId}`,
        trade_id: position.trade_id,
      });

    console.log("=== POSITION CLOSED SUCCESSFULLY ===");
    console.log("Exit Order ID:", exitOrderId);
    console.log("Net P&L:", netProfit.toFixed(2));
    console.log("TP Filled:", tpFilled);

    return new Response(JSON.stringify({
      success: true,
      position: {
        id: positionId,
        exitOrderId,
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
        isLive: exitResult.isLive,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("=== CLOSE POSITION FAILED ===");
    console.error("Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
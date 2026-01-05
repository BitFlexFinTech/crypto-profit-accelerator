import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

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

interface OrderResult {
  success: boolean;
  orderId: string;
  executedPrice?: number;
  executedQty?: number;
  error?: string;
  errorCode?: string;
  errorType?: 'API_PERMISSION_ERROR' | 'INSUFFICIENT_BALANCE' | 'EXCHANGE_ERROR' | 'NETWORK_ERROR' | 'NO_CREDENTIALS';
}

// Error code patterns for API permission issues
const PERMISSION_ERROR_CODES: Record<string, string[]> = {
  binance: ['-2015', '-2014', '-1022'],  // Invalid API-key, IP, or permissions
  okx: ['50120', '50111', '50113'],       // Invalid API key or permission denied
  bybit: ['10003', '10004', '10027'],     // Invalid API key or insufficient permissions
};

// Helper to detect permission errors from exchange responses
function isPermissionError(exchange: string, errorCode: string | number | undefined, errorMsg: string): boolean {
  const code = String(errorCode);
  const codes = PERMISSION_ERROR_CODES[exchange] || [];
  if (codes.includes(code)) return true;
  
  const permissionKeywords = ['permission', 'api-key', 'apikey', 'api key', 'ip', 'unauthorized', 'forbidden'];
  return permissionKeywords.some(kw => errorMsg.toLowerCase().includes(kw));
}

// Get suggestion for fixing permission errors
function getPermissionFixSuggestion(exchange: string): string {
  switch (exchange) {
    case 'binance':
      return "Enable 'Spot Trading' and 'Futures Trading' permissions on your Binance API key. Also check IP whitelist includes Supabase IPs or disable IP restriction.";
    case 'okx':
      return "Enable 'Trade' permission on your OKX API key. For futures, enable 'Futures Trade' permission.";
    case 'bybit':
      return "Enable 'Trade' permission on your Bybit API key. Check that API key is not expired.";
    default:
      return "Check that your API key has trading permissions enabled and IP restrictions are properly configured.";
  }
}

interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

// Format symbol for each exchange
function formatSymbol(symbol: string, exchange: string, tradeType: "spot" | "futures"): string {
  const base = symbol.replace("/", "");
  
  switch (exchange) {
    case "binance":
      return tradeType === "futures" ? base : base; // BTCUSDT
    case "okx":
      if (tradeType === "futures") {
        return symbol.replace("/", "-") + "-SWAP"; // BTC-USDT-SWAP
      }
      return symbol.replace("/", "-"); // BTC-USDT
    case "bybit":
      return base; // BTCUSDT
    default:
      return base;
  }
}

// LOT_SIZE stepSize precision for common trading pairs (Binance/Bybit)
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
    console.log(`[formatQuantity] OKX SWAP ${baseAsset}: ${quantity} / ${contractSize} = ${numContracts} contracts`);
    return numContracts.toString();
  }
  
  // Binance/Bybit: use regular quantity precision
  const precision = QUANTITY_PRECISION[baseAsset] ?? 2;
  const multiplier = Math.pow(10, precision);
  const roundedQty = Math.floor(quantity * multiplier) / multiplier;
  
  console.log(`[formatQuantity] ${symbol} -> ${baseAsset}: ${quantity} -> ${roundedQty} (precision: ${precision})`);
  
  return roundedQty.toFixed(precision);
}

// Format price to proper precision
function formatPrice(price: number, symbol: string): string {
  if (price > 1000) {
    return price.toFixed(2);
  } else if (price > 1) {
    return price.toFixed(4);
  } else {
    return price.toFixed(6);
  }
}

// Calculate take-profit price including all fees
function calculateTakeProfitPrice(
  entryPrice: number,
  direction: "long" | "short",
  profitTarget: number,
  orderSizeUsd: number,
  quantity: number,
  leverage: number,
  tradeType: "spot" | "futures"
): number {
  const feeRate = tradeType === "spot" ? 0.001 : 0.0005;
  const entryFee = orderSizeUsd * feeRate;
  const exitFee = orderSizeUsd * feeRate;
  const fundingFee = tradeType === "futures" ? orderSizeUsd * 0.0001 : 0;
  const totalFees = entryFee + exitFee + fundingFee;
  
  const requiredGrossProfit = profitTarget + totalFees;
  const priceMovementNeeded = requiredGrossProfit / (quantity * leverage);
  
  if (direction === "long") {
    return entryPrice + priceMovementNeeded;
  } else {
    return entryPrice - priceMovementNeeded;
  }
}

// ============================================
// BINANCE - PLACE MARKET ORDER (ENTRY)
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
      side: side, // BUY or SELL
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
    
    console.log(`[Binance] Placing MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Binance] MARKET order failed:`, data);
      const errorCode = String(data.code || response.status);
      const errorMsg = data.msg || `Binance API error: ${response.status}`;
      const isPermErr = isPermissionError('binance', data.code, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    // Extract executed price from fills
    let executedPrice = 0;
    let executedQty = 0;
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
      executedQty = totalQty;
    } else {
      executedPrice = parseFloat(data.avgPrice) || parseFloat(data.price) || 0;
      executedQty = parseFloat(data.executedQty) || quantity;
    }
    
    console.log(`[Binance] MARKET order filled: ${data.orderId} @ avg price ${executedPrice}`);
    return { 
      success: true, 
      orderId: data.orderId.toString(),
      executedPrice,
      executedQty
    };
  } catch (error) {
    console.error(`[Binance] MARKET order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// BINANCE - PLACE LIMIT ORDER (TP)
// ============================================
async function placeBinanceLimitOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  price: number,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<OrderResult> {
  try {
    const timestamp = Date.now();
    const formattedSymbol = formatSymbol(symbol, "binance", tradeType);
    
    const params = new URLSearchParams({
      symbol: formattedSymbol,
      side: side,
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: formatQuantity(quantity, symbol),
      price: formatPrice(price, symbol),
      timestamp: timestamp.toString(),
    });
    
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(params.toString())
      .digest("hex");
    
    const baseUrl = tradeType === "futures" 
      ? "https://fapi.binance.com/fapi/v1/order"
      : "https://api.binance.com/api/v3/order";
    
    console.log(`[Binance] Placing LIMIT ${side} order: ${quantity} ${formattedSymbol} @ ${price}`);
    
    const response = await fetch(`${baseUrl}?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": credentials.apiKey },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`[Binance] LIMIT order failed:`, data);
      const errorCode = String(data.code || response.status);
      const errorMsg = data.msg || `Binance API error: ${response.status}`;
      const isPermErr = isPermissionError('binance', data.code, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    console.log(`[Binance] LIMIT order placed: ${data.orderId}`);
    return { success: true, orderId: data.orderId.toString() };
  } catch (error) {
    console.error(`[Binance] LIMIT order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// OKX - PLACE MARKET ORDER (ENTRY)
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
    
    const formattedQty = formatQuantity(quantity, symbol, "okx", tradeType);
    
    // VALIDATION: Prevent 0 contract orders for OKX futures
    if (tradeType === "futures" && (formattedQty === "0" || parseInt(formattedQty, 10) < 1)) {
      console.error(`[OKX] Order size too small: ${quantity} -> ${formattedQty} contracts`);
      return { 
        success: false, 
        orderId: "", 
        error: "Order size too small for minimum contract size. Increase order size or choose a different pair.",
        errorCode: "MIN_CONTRACT",
        errorType: 'EXCHANGE_ERROR',
      };
    }
    
    const body = JSON.stringify({
      instId: formattedSymbol,
      tdMode: tradeType === "futures" ? "cross" : "cash",
      side: side.toLowerCase(),
      ordType: "market",
      sz: formattedQty,
    });
    
    const preHash = timestamp + "POST" + "/api/v5/trade/order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX] Placing MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
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
      console.error(`[OKX] MARKET order failed:`, data);
      const errorCode = String(data.code);
      const errorMsg = data.msg || `OKX API error: ${data.code}`;
      const isPermErr = isPermissionError('okx', data.code, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    const orderId = data.data?.[0]?.ordId || "";
    const avgPx = parseFloat(data.data?.[0]?.avgPx || "0");
    
    console.log(`[OKX] MARKET order filled: ${orderId} @ avg price ${avgPx}`);
    return { success: true, orderId, executedPrice: avgPx };
  } catch (error) {
    console.error(`[OKX] MARKET order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// OKX - PLACE LIMIT ORDER (TP)
// ============================================
async function placeOKXLimitOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  price: number,
  quantity: number,
  tradeType: "spot" | "futures"
): Promise<OrderResult> {
  try {
    const timestamp = new Date().toISOString();
    const formattedSymbol = formatSymbol(symbol, "okx", tradeType);
    
    const formattedQty = formatQuantity(quantity, symbol, "okx", tradeType);
    const body = JSON.stringify({
      instId: formattedSymbol,
      tdMode: tradeType === "futures" ? "cross" : "cash",
      side: side.toLowerCase(),
      ordType: "limit",
      px: formatPrice(price, symbol),
      sz: formattedQty,
    });
    
    const preHash = timestamp + "POST" + "/api/v5/trade/order" + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("base64");
    
    console.log(`[OKX] Placing LIMIT ${side} order: ${quantity} ${formattedSymbol} @ ${price}`);
    
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
      console.error(`[OKX] LIMIT order failed:`, data);
      const errorCode = String(data.code);
      const errorMsg = data.msg || `OKX API error: ${data.code}`;
      const isPermErr = isPermissionError('okx', data.code, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    const orderId = data.data?.[0]?.ordId || "";
    console.log(`[OKX] LIMIT order placed: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    console.error(`[OKX] LIMIT order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// BYBIT - PLACE MARKET ORDER (ENTRY)
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
    
    console.log(`[Bybit] Placing MARKET ${side} order: ${quantity} ${formattedSymbol}`);
    
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
      console.error(`[Bybit] MARKET order failed:`, data);
      const errorCode = String(data.retCode);
      const errorMsg = data.retMsg || `Bybit API error: ${data.retCode}`;
      const isPermErr = isPermissionError('bybit', data.retCode, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    const orderId = data.result?.orderId || "";
    const avgPrice = parseFloat(data.result?.avgPrice || "0");
    
    console.log(`[Bybit] MARKET order filled: ${orderId} @ avg price ${avgPrice}`);
    return { success: true, orderId, executedPrice: avgPrice };
  } catch (error) {
    console.error(`[Bybit] MARKET order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// BYBIT - PLACE LIMIT ORDER (TP)
// ============================================
async function placeBybitLimitOrder(
  credentials: ExchangeCredentials,
  symbol: string,
  side: string,
  price: number,
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
      orderType: "Limit",
      qty: formatQuantity(quantity, symbol),
      price: formatPrice(price, symbol),
      timeInForce: "GTC",
    });
    
    const preHash = timestamp + credentials.apiKey + recvWindow + body;
    const signature = createHmac("sha256", credentials.apiSecret)
      .update(preHash)
      .digest("hex");
    
    console.log(`[Bybit] Placing LIMIT ${side} order: ${quantity} ${formattedSymbol} @ ${price}`);
    
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
      console.error(`[Bybit] LIMIT order failed:`, data);
      const errorCode = String(data.retCode);
      const errorMsg = data.retMsg || `Bybit API error: ${data.retCode}`;
      const isPermErr = isPermissionError('bybit', data.retCode, errorMsg);
      return { 
        success: false, 
        orderId: "", 
        error: errorMsg,
        errorCode,
        errorType: isPermErr ? 'API_PERMISSION_ERROR' : 'EXCHANGE_ERROR',
      };
    }
    
    const orderId = data.result?.orderId || "";
    console.log(`[Bybit] LIMIT order placed: ${orderId}`);
    return { success: true, orderId };
  } catch (error) {
    console.error(`[Bybit] LIMIT order exception:`, error);
    return { 
      success: false, 
      orderId: "", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ============================================
// UNIFIED ENTRY ORDER (MARKET)
// ============================================
async function placeEntryOrder(
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
  requestedPrice: number
): Promise<{ orderId: string; isLive: boolean; executedPrice: number; error?: string; errorType?: string; errorCode?: string; suggestion?: string }> {
  console.log(`[${exchange.exchange}] Entry order: ${side} ${quantity} ${symbol} (Paper: ${isPaperTrade})`);
  
  // Paper trading - simulate entry
  if (isPaperTrade) {
    const slippage = (Math.random() * 0.0004 + 0.0001);
    const simulatedPrice = side === "BUY" 
      ? requestedPrice * (1 + slippage)
      : requestedPrice * (1 - slippage);
    console.log(`[PAPER] Simulated entry at ${simulatedPrice.toFixed(6)}`);
    return { 
      orderId: `ENTRY-PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isLive: false,
      executedPrice: simulatedPrice
    };
  }
  
  // Check if we have API credentials
  if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
    console.error(`[${exchange.exchange}] NO API CREDENTIALS - CANNOT EXECUTE LIVE TRADE`);
    return { 
      orderId: "",
      isLive: false,
      executedPrice: 0,
      error: "No API credentials configured - cannot execute live trade",
      errorType: "NO_CREDENTIALS",
      suggestion: "Connect your exchange API keys in the Settings page."
    };
  }
  
  const credentials: ExchangeCredentials = {
    exchange: exchange.exchange,
    apiKey: exchange.api_key_encrypted,
    apiSecret: exchange.api_secret_encrypted,
    passphrase: exchange.passphrase_encrypted || undefined,
  };
  
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
      console.error(`[${exchange.exchange}] Exchange not supported for live trading`);
      return { 
        orderId: "",
        isLive: false,
        executedPrice: 0,
        error: `Exchange ${exchange.exchange} not supported for live trading`,
        errorType: "EXCHANGE_ERROR"
      };
  }
  
  if (!result.success) {
    console.error(`[${exchange.exchange}] ENTRY ORDER FAILED: ${result.error}`);
    const suggestion = result.errorType === 'API_PERMISSION_ERROR' 
      ? getPermissionFixSuggestion(exchange.exchange)
      : undefined;
    return { 
      orderId: "",
      isLive: false,
      executedPrice: 0,
      error: result.error,
      errorType: result.errorType,
      errorCode: result.errorCode,
      suggestion
    };
  }
  
  return { 
    orderId: result.orderId, 
    isLive: true,
    executedPrice: result.executedPrice || requestedPrice
  };
}

// ============================================
// UNIFIED TP ORDER (LIMIT)
// ============================================
async function placeTakeProfitOrder(
  exchange: { 
    exchange: string; 
    api_key_encrypted: string | null; 
    api_secret_encrypted: string | null;
    passphrase_encrypted: string | null;
  },
  symbol: string,
  side: string,
  price: number,
  quantity: number,
  tradeType: "spot" | "futures",
  isPaperTrade: boolean
): Promise<{ orderId: string; isLive: boolean; error?: string }> {
  console.log(`[${exchange.exchange}] TP order: ${side} ${quantity} ${symbol} @ ${price}`);
  
  if (isPaperTrade) {
    console.log(`[PAPER] Simulated TP order`);
    return { 
      orderId: `TP-PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isLive: false 
    };
  }
  
  if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
    return { 
      orderId: "",
      isLive: false,
      error: "No API credentials"
    };
  }
  
  const credentials: ExchangeCredentials = {
    exchange: exchange.exchange,
    apiKey: exchange.api_key_encrypted,
    apiSecret: exchange.api_secret_encrypted,
    passphrase: exchange.passphrase_encrypted || undefined,
  };
  
  let result: OrderResult;
  
  switch (exchange.exchange) {
    case "binance":
      result = await placeBinanceLimitOrder(credentials, symbol, side, price, quantity, tradeType);
      break;
    case "okx":
      result = await placeOKXLimitOrder(credentials, symbol, side, price, quantity, tradeType);
      break;
    case "bybit":
      result = await placeBybitLimitOrder(credentials, symbol, side, price, quantity, tradeType);
      break;
    default:
      return { orderId: "", isLive: false, error: `Exchange ${exchange.exchange} not supported` };
  }
  
  if (!result.success) {
    console.error(`[${exchange.exchange}] TP ORDER FAILED: ${result.error}`);
    return { orderId: "", isLive: false, error: result.error };
  }
  
  return { orderId: result.orderId, isLive: true };
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

    const tradeRequest: TradeRequest = await req.json();
    
    console.log("=== EXECUTE TRADE REQUEST ===");
    console.log("Symbol:", tradeRequest.symbol);
    console.log("Direction:", tradeRequest.direction);
    console.log("Type:", tradeRequest.tradeType);
    console.log("Size:", tradeRequest.orderSizeUsd);
    console.log("Paper:", tradeRequest.isPaperTrade);

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

    // Calculate quantity and fees
    const quantity = tradeRequest.orderSizeUsd / tradeRequest.entryPrice;
    const leverage = tradeRequest.leverage || 1;
    const feeRate = tradeRequest.tradeType === "spot" ? 0.001 : 0.0005;
    const entryFee = tradeRequest.orderSizeUsd * feeRate;

    // Determine entry side
    const entrySide = tradeRequest.direction === "long" ? "BUY" : "SELL";
    
    // ============================================
    // STEP 1: PLACE ENTRY ORDER ON EXCHANGE
    // ============================================
    console.log("=== STEP 1: PLACING ENTRY ORDER ===");
    
    const entryResult = await placeEntryOrder(
      exchange,
      tradeRequest.symbol,
      entrySide,
      quantity,
      tradeRequest.tradeType,
      tradeRequest.isPaperTrade,
      tradeRequest.entryPrice
    );
    
    // HARD FAIL: If live trade and entry fails, abort entirely
    if (!tradeRequest.isPaperTrade && !entryResult.isLive) {
      console.error("=== LIVE ENTRY FAILED - ABORTING ===");
      throw new Error(`Live entry order failed: ${entryResult.error}`);
    }
    
    const executedPrice = entryResult.executedPrice;
    const entryOrderId = entryResult.orderId;
    const isLive = entryResult.isLive;
    
    console.log(`Entry order result: ID=${entryOrderId}, Price=${executedPrice}, Live=${isLive}`);

    // ============================================
    // STEP 2: CALCULATE TAKE-PROFIT PRICE
    // ============================================
    const takeProfitPrice = calculateTakeProfitPrice(
      executedPrice,
      tradeRequest.direction,
      tradeRequest.profitTarget,
      tradeRequest.orderSizeUsd,
      quantity,
      leverage,
      tradeRequest.tradeType
    );

    console.log(`TP price calculated: $${takeProfitPrice.toFixed(6)} for ${tradeRequest.direction}`);

    // ============================================
    // STEP 3: CREATE TRADE RECORD
    // ============================================
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
        is_live: isLive,
        entry_order_id: entryOrderId,
        ai_score: tradeRequest.aiScore,
        ai_reasoning: tradeRequest.aiReasoning,
        status: "open",
        opened_at: new Date().toISOString(),
        tp_price: takeProfitPrice,
        tp_placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // ============================================
    // STEP 4: PLACE TAKE-PROFIT ORDER
    // ============================================
    console.log("=== STEP 4: PLACING TP ORDER ===");
    
    const tpSide = tradeRequest.direction === "long" ? "SELL" : "BUY";
    
    const tpResult = await placeTakeProfitOrder(
      exchange,
      tradeRequest.symbol,
      tpSide,
      takeProfitPrice,
      quantity,
      tradeRequest.tradeType,
      tradeRequest.isPaperTrade
    );

    const takeProfitOrderId = tpResult.orderId;
    
    console.log(`TP order result: ID=${takeProfitOrderId}, Live=${tpResult.isLive}`);
    
    if (tpResult.error) {
      console.warn(`TP Order warning: ${tpResult.error}`);
    }

    // ============================================
    // STEP 5: CREATE POSITION RECORD
    // ============================================
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
        unrealized_pnl: -entryFee,
        is_paper_trade: tradeRequest.isPaperTrade,
        is_live: isLive,
        entry_order_id: entryOrderId,
        status: "open",
        opened_at: new Date().toISOString(),
        take_profit_order_id: takeProfitOrderId,
        take_profit_price: takeProfitPrice,
        take_profit_status: "pending",
        take_profit_placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (positionError) throw positionError;

    // ============================================
    // STEP 6: CREATE NOTIFICATION
    // ============================================
    const liveIndicator = isLive ? "🔴 LIVE" : "📝 Paper";
    await supabase
      .from("notifications")
      .insert({
        user_id: exchange.user_id,
        type: "trade_opened",
        title: `${liveIndicator} ${tradeRequest.direction.toUpperCase()} ${tradeRequest.symbol}`,
        message: `Opened ${tradeRequest.direction} on ${exchange.exchange} at $${executedPrice.toFixed(4)}. Size: $${tradeRequest.orderSizeUsd.toFixed(2)}. Entry Order: ${entryOrderId}. TP @ $${takeProfitPrice.toFixed(4)}`,
        trade_id: trade.id,
      });

    console.log("=== TRADE EXECUTED SUCCESSFULLY ===");
    console.log("Trade ID:", trade.id);
    console.log("Entry Order:", entryOrderId);
    console.log("TP Order:", takeProfitOrderId);
    console.log("Is Live:", isLive);

    return new Response(JSON.stringify({
      success: true,
      trade: {
        id: trade.id,
        entryOrderId,
        symbol: tradeRequest.symbol,
        direction: tradeRequest.direction,
        entryPrice: executedPrice,
        quantity,
        orderSizeUsd: tradeRequest.orderSizeUsd,
        entryFee,
        isPaperTrade: tradeRequest.isPaperTrade,
        isLive,
      },
      position: {
        id: position.id,
        profitTarget: tradeRequest.profitTarget,
        takeProfitOrderId,
        takeProfitPrice,
        takeProfitStatus: "pending",
        isLive,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("=== TRADE EXECUTION FAILED ===");
    console.error("Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Detect permission errors from the error message
    let errorType = "EXCHANGE_ERROR";
    let suggestion: string | undefined;
    
    if (errorMessage.toLowerCase().includes('permission') || 
        errorMessage.toLowerCase().includes('api-key') ||
        errorMessage.toLowerCase().includes('ip')) {
      errorType = "API_PERMISSION_ERROR";
      suggestion = "Check that your API keys have trading permissions enabled. Go to Settings to update your API keys.";
    } else if (errorMessage.toLowerCase().includes('credential')) {
      errorType = "NO_CREDENTIALS";
      suggestion = "Connect your exchange API keys in the Settings page.";
    } else if (errorMessage.toLowerCase().includes('balance') || 
               errorMessage.toLowerCase().includes('insufficient')) {
      errorType = "INSUFFICIENT_BALANCE";
      suggestion = "Add more funds to your exchange account or reduce order size.";
    } else if (errorMessage.toLowerCase().includes('minimum') || 
               errorMessage.toLowerCase().includes('contract size') ||
               errorMessage.toLowerCase().includes('order amount')) {
      errorType = "EXCHANGE_ERROR";
      suggestion = "Order size is too small for this pair. Increase order size or try a different trading pair.";
    }
    
    // Return HTTP 200 with success:false for expected business/exchange failures
    // This prevents the client from seeing opaque "non-2xx status code" errors
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      errorType,
      suggestion,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
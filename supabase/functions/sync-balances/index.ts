import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting per exchange
const RATE_LIMITS: Record<string, { requests: number; window: number }> = {
  binance: { requests: 1200, window: 60000 },
  okx: { requests: 60, window: 2000 },
  bybit: { requests: 120, window: 60000 },
  kucoin: { requests: 30, window: 1000 },
  hyperliquid: { requests: 1200, window: 60000 },
  nexo: { requests: 30, window: 1000 },
};

async function fetchBinanceBalance(apiKey: string, apiSecret: string): Promise<{ total: number; available: number; locked: number }> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createHmac("sha256", apiSecret).update(queryString).digest("hex");
  
  const response = await fetch(
    `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
    {
      headers: { "X-MBX-APIKEY": apiKey },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Binance API error: ${error}`);
  }
  
  const data = await response.json();
  let total = 0;
  let available = 0;
  let locked = 0;
  
  // Sum up USDT balances (and convert other assets to USDT equivalent if needed)
  for (const balance of data.balances || []) {
    if (balance.asset === "USDT") {
      const free = parseFloat(balance.free) || 0;
      const lockedAmt = parseFloat(balance.locked) || 0;
      total += free + lockedAmt;
      available += free;
      locked += lockedAmt;
    }
  }
  
  return { total, available, locked };
}

async function fetchOKXBalance(apiKey: string, apiSecret: string, passphrase: string): Promise<{ total: number; available: number; locked: number }> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  const preHash = timestamp + method + requestPath;
  const signature = createHmac("sha256", apiSecret).update(preHash).digest("base64");
  
  const response = await fetch(`https://www.okx.com${requestPath}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OKX API error: ${error}`);
  }
  
  const data = await response.json();
  let total = 0;
  let available = 0;
  let locked = 0;
  
  for (const detail of data.data?.[0]?.details || []) {
    if (detail.ccy === "USDT") {
      total += parseFloat(detail.eq) || 0;
      available += parseFloat(detail.availBal) || 0;
      locked += parseFloat(detail.frozenBal) || 0;
    }
  }
  
  return { total, available, locked };
}

async function fetchBybitBalance(apiKey: string, apiSecret: string): Promise<{ total: number; available: number; locked: number }> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `accountType=UNIFIED`;
  const preHash = timestamp + apiKey + recvWindow + params;
  const signature = createHmac("sha256", apiSecret).update(preHash).digest("hex");
  
  const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bybit API error: ${error}`);
  }
  
  const data = await response.json();
  let total = 0;
  let available = 0;
  let locked = 0;
  
  for (const account of data.result?.list || []) {
    for (const coin of account.coin || []) {
      if (coin.coin === "USDT") {
        total += parseFloat(coin.walletBalance) || 0;
        available += parseFloat(coin.availableToWithdraw) || 0;
        locked += parseFloat(coin.locked) || 0;
      }
    }
  }
  
  return { total, available, locked };
}

async function fetchKuCoinBalance(apiKey: string, apiSecret: string, passphrase: string): Promise<{ total: number; available: number; locked: number }> {
  const timestamp = Date.now().toString();
  const method = "GET";
  const endpoint = "/api/v1/accounts";
  const preHash = timestamp + method + endpoint;
  const signature = createHmac("sha256", apiSecret).update(preHash).digest("base64");
  const passphraseHash = createHmac("sha256", apiSecret).update(passphrase).digest("base64");
  
  const response = await fetch(`https://api.kucoin.com${endpoint}`, {
    headers: {
      "KC-API-KEY": apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": passphraseHash,
      "KC-API-KEY-VERSION": "2",
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`KuCoin API error: ${error}`);
  }
  
  const data = await response.json();
  let total = 0;
  let available = 0;
  let locked = 0;
  
  for (const account of data.data || []) {
    if (account.currency === "USDT") {
      const balance = parseFloat(account.balance) || 0;
      const availableAmt = parseFloat(account.available) || 0;
      const holds = parseFloat(account.holds) || 0;
      total += balance;
      available += availableAmt;
      locked += holds;
    }
  }
  
  return { total, available, locked };
}

async function fetchHyperliquidBalance(apiKey: string): Promise<{ total: number; available: number; locked: number }> {
  // Hyperliquid uses wallet address as API key
  const response = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "clearinghouseState",
      user: apiKey,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hyperliquid API error: ${error}`);
  }
  
  const data = await response.json();
  const accountValue = parseFloat(data.marginSummary?.accountValue) || 0;
  const totalMarginUsed = parseFloat(data.marginSummary?.totalMarginUsed) || 0;
  
  return {
    total: accountValue,
    available: accountValue - totalMarginUsed,
    locked: totalMarginUsed,
  };
}

async function fetchNexoBalance(apiKey: string, apiSecret: string): Promise<{ total: number; available: number; locked: number }> {
  const nonce = Date.now().toString();
  const signature = createHmac("sha256", apiSecret).update(nonce).digest("hex");
  
  const response = await fetch("https://api.nexo.io/api/v1/accountSummary", {
    headers: {
      "X-API-KEY": apiKey,
      "X-NONCE": nonce,
      "X-SIGNATURE": signature,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Nexo API error: ${error}`);
  }
  
  const data = await response.json();
  let total = 0;
  let available = 0;
  let locked = 0;
  
  for (const asset of data.balances || []) {
    if (asset.assetName === "USDT" || asset.assetName === "USDX") {
      total += parseFloat(asset.totalBalance) || 0;
      available += parseFloat(asset.availableBalance) || 0;
      locked += parseFloat(asset.lockedBalance) || 0;
    }
  }
  
  return { total, available, locked };
}

// Simple decryption (in production, use proper key management)
function decryptKey(encrypted: string): string {
  // If keys are stored in plain text (for development), return as-is
  // In production, implement proper AES decryption with Supabase Vault
  return encrypted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all connected exchanges with API keys
    const { data: exchanges, error: exchangesError } = await supabase
      .from("exchanges")
      .select("*")
      .eq("is_connected", true);

    if (exchangesError) throw exchangesError;

    console.log(`Syncing balances for ${exchanges?.length || 0} connected exchanges`);

    const results: any[] = [];

    for (const exchange of exchanges || []) {
      try {
        // Skip if no API keys configured
        if (!exchange.api_key_encrypted || !exchange.api_secret_encrypted) {
          console.log(`Skipping ${exchange.exchange}: No API keys configured`);
          results.push({
            exchange: exchange.exchange,
            status: "skipped",
            reason: "No API keys configured",
          });
          continue;
        }

        const apiKey = decryptKey(exchange.api_key_encrypted);
        const apiSecret = decryptKey(exchange.api_secret_encrypted);
        const passphrase = exchange.passphrase_encrypted ? decryptKey(exchange.passphrase_encrypted) : "";
        
        let balanceData: { total: number; available: number; locked: number };
        
        switch (exchange.exchange) {
          case "binance":
            balanceData = await fetchBinanceBalance(apiKey, apiSecret);
            break;
          case "okx":
            balanceData = await fetchOKXBalance(apiKey, apiSecret, passphrase);
            break;
          case "bybit":
            balanceData = await fetchBybitBalance(apiKey, apiSecret);
            break;
          case "kucoin":
            balanceData = await fetchKuCoinBalance(apiKey, apiSecret, passphrase);
            break;
          case "hyperliquid":
            balanceData = await fetchHyperliquidBalance(apiKey);
            break;
          case "nexo":
            balanceData = await fetchNexoBalance(apiKey, apiSecret);
            break;
          default:
            console.log(`Unknown exchange: ${exchange.exchange}`);
            continue;
        }

        // Update or insert balance record
        const { data: existingBalance } = await supabase
          .from("balances")
          .select("id")
          .eq("exchange_id", exchange.id)
          .maybeSingle();

        if (existingBalance) {
          await supabase
            .from("balances")
            .update({
              total: balanceData.total,
              available: balanceData.available,
              locked: balanceData.locked,
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
              total: balanceData.total,
              available: balanceData.available,
              locked: balanceData.locked,
            });
        }

        // Update last sync time
        await supabase
          .from("exchanges")
          .update({ last_balance_sync: new Date().toISOString() })
          .eq("id", exchange.id);

        results.push({
          exchange: exchange.exchange,
          balance: balanceData.total,
          available: balanceData.available,
          locked: balanceData.locked,
          status: "synced",
        });

        console.log(`Synced ${exchange.exchange}: Total $${balanceData.total.toFixed(2)}, Available $${balanceData.available.toFixed(2)}`);

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
      skipped: results.filter(r => r.status === "skipped").length,
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

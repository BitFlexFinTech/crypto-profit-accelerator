import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue?: number;
}

// Fetch current prices from Binance for USD value calculation
async function fetchBinancePrices(): Promise<Record<string, number>> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price");
    const data = await response.json();
    const prices: Record<string, number> = { USDT: 1, USDC: 1, BUSD: 1 };
    
    for (const ticker of data) {
      if (ticker.symbol.endsWith("USDT")) {
        const asset = ticker.symbol.replace("USDT", "");
        prices[asset] = parseFloat(ticker.price) || 0;
      }
    }
    return prices;
  } catch (error) {
    console.error("Failed to fetch prices:", error);
    return { USDT: 1, USDC: 1, BUSD: 1 };
  }
}

async function fetchBinanceBalances(apiKey: string, apiSecret: string): Promise<AssetBalance[]> {
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
  const balances: AssetBalance[] = [];
  
  // Get ALL non-zero balances
  for (const balance of data.balances || []) {
    const free = parseFloat(balance.free) || 0;
    const locked = parseFloat(balance.locked) || 0;
    const total = free + locked;
    
    if (total > 0.00001) {
      balances.push({
        asset: balance.asset,
        free,
        locked,
        total
      });
    }
  }
  
  return balances;
}

async function fetchOKXBalances(apiKey: string, apiSecret: string, passphrase: string): Promise<AssetBalance[]> {
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
  const balances: AssetBalance[] = [];
  
  // Get ALL non-zero balances
  for (const detail of data.data?.[0]?.details || []) {
    const total = parseFloat(detail.eq) || 0;
    const available = parseFloat(detail.availBal) || 0;
    const frozen = parseFloat(detail.frozenBal) || 0;
    
    if (total > 0.00001) {
      balances.push({
        asset: detail.ccy,
        free: available,
        locked: frozen,
        total
      });
    }
  }
  
  return balances;
}

async function fetchBybitBalances(apiKey: string, apiSecret: string): Promise<AssetBalance[]> {
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
  const balances: AssetBalance[] = [];
  
  for (const account of data.result?.list || []) {
    for (const coin of account.coin || []) {
      const walletBalance = parseFloat(coin.walletBalance) || 0;
      const available = parseFloat(coin.availableToWithdraw) || 0;
      const locked = parseFloat(coin.locked) || 0;
      
      if (walletBalance > 0.00001) {
        balances.push({
          asset: coin.coin,
          free: available,
          locked: locked,
          total: walletBalance
        });
      }
    }
  }
  
  return balances;
}

async function fetchKuCoinBalances(apiKey: string, apiSecret: string, passphrase: string): Promise<AssetBalance[]> {
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
  const assetMap: Record<string, AssetBalance> = {};
  
  for (const account of data.data || []) {
    const balance = parseFloat(account.balance) || 0;
    const availableAmt = parseFloat(account.available) || 0;
    const holds = parseFloat(account.holds) || 0;
    
    if (balance > 0.00001) {
      const asset = account.currency;
      if (!assetMap[asset]) {
        assetMap[asset] = { asset, free: 0, locked: 0, total: 0 };
      }
      assetMap[asset].free += availableAmt;
      assetMap[asset].locked += holds;
      assetMap[asset].total += balance;
    }
  }
  
  return Object.values(assetMap);
}

async function fetchHyperliquidBalances(apiKey: string): Promise<AssetBalance[]> {
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
  
  // Hyperliquid primarily uses USDC
  return [{
    asset: "USDC",
    free: accountValue - totalMarginUsed,
    locked: totalMarginUsed,
    total: accountValue
  }];
}

async function fetchNexoBalances(apiKey: string, apiSecret: string): Promise<AssetBalance[]> {
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
  const balances: AssetBalance[] = [];
  
  for (const asset of data.balances || []) {
    const total = parseFloat(asset.totalBalance) || 0;
    const available = parseFloat(asset.availableBalance) || 0;
    const locked = parseFloat(asset.lockedBalance) || 0;
    
    if (total > 0.00001) {
      balances.push({
        asset: asset.assetName,
        free: available,
        locked: locked,
        total
      });
    }
  }
  
  return balances;
}

// Simple decryption (in production, use proper key management)
function decryptKey(encrypted: string): string {
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

    // Fetch current prices for USD value calculation
    const prices = await fetchBinancePrices();
    console.log(`Fetched prices for ${Object.keys(prices).length} assets`);

    const results: any[] = [];

    for (const exchange of exchanges || []) {
      try {
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
        
        let assetBalances: AssetBalance[];
        
        switch (exchange.exchange) {
          case "binance":
            assetBalances = await fetchBinanceBalances(apiKey, apiSecret);
            break;
          case "okx":
            assetBalances = await fetchOKXBalances(apiKey, apiSecret, passphrase);
            break;
          case "bybit":
            assetBalances = await fetchBybitBalances(apiKey, apiSecret);
            break;
          case "kucoin":
            assetBalances = await fetchKuCoinBalances(apiKey, apiSecret, passphrase);
            break;
          case "hyperliquid":
            assetBalances = await fetchHyperliquidBalances(apiKey);
            break;
          case "nexo":
            assetBalances = await fetchNexoBalances(apiKey, apiSecret);
            break;
          default:
            console.log(`Unknown exchange: ${exchange.exchange}`);
            continue;
        }

        // Calculate USD values for each asset
        let totalUsdValue = 0;
        for (const balance of assetBalances) {
          const price = prices[balance.asset] || 0;
          balance.usdValue = balance.total * price;
          totalUsdValue += balance.usdValue;
        }

        console.log(`${exchange.exchange}: Found ${assetBalances.length} assets, total USD: $${totalUsdValue.toFixed(2)}`);

        // Upsert each asset balance (atomic update)
        const currentAssets: string[] = [];
        for (const balance of assetBalances) {
          currentAssets.push(balance.asset);
          await supabase
            .from("balances")
            .upsert({
              exchange_id: exchange.id,
              user_id: exchange.user_id,
              currency: balance.asset,
              total: balance.usdValue || balance.total,
              available: balance.free,
              locked: balance.locked,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'exchange_id,currency',
            });
        }

        // Delete assets no longer on exchange
        if (currentAssets.length > 0) {
          await supabase
            .from("balances")
            .delete()
            .eq("exchange_id", exchange.id)
            .not("currency", "in", `(${currentAssets.join(",")})`);
        }

        // Update last sync time
        await supabase
          .from("exchanges")
          .update({ last_balance_sync: new Date().toISOString() })
          .eq("id", exchange.id);

        results.push({
          exchange: exchange.exchange,
          assets: assetBalances.map(b => ({
            asset: b.asset,
            amount: b.total,
            usdValue: b.usdValue
          })),
          totalUsd: totalUsdValue,
          status: "synced",
        });

        console.log(`Synced ${exchange.exchange}: ${assetBalances.length} assets, Total $${totalUsdValue.toFixed(2)}`);

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

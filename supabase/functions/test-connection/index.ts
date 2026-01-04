import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function testBinance(apiKey: string, apiSecret: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = createHmac("sha256", apiSecret).update(queryString).digest("hex");
    
    const response = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": apiKey } }
    );
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, balance: 0, error: error.msg || `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    let balance = 0;
    
    for (const b of data.balances || []) {
      if (b.asset === "USDT") {
        balance = parseFloat(b.free) + parseFloat(b.locked);
      }
    }
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testOKX(apiKey: string, apiSecret: string, passphrase: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
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
      const error = await response.json();
      return { success: false, balance: 0, error: error.msg || `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.code !== "0") {
      return { success: false, balance: 0, error: data.msg || "OKX API error" };
    }
    
    let balance = 0;
    for (const detail of data.data?.[0]?.details || []) {
      if (detail.ccy === "USDT") {
        balance = parseFloat(detail.eq) || 0;
      }
    }
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testBybit(apiKey: string, apiSecret: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
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
      return { success: false, balance: 0, error: `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      return { success: false, balance: 0, error: data.retMsg || "Bybit API error" };
    }
    
    let balance = 0;
    for (const account of data.result?.list || []) {
      for (const coin of account.coin || []) {
        if (coin.coin === "USDT") {
          balance = parseFloat(coin.walletBalance) || 0;
        }
      }
    }
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testKuCoin(apiKey: string, apiSecret: string, passphrase: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
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
      return { success: false, balance: 0, error: `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.code !== "200000") {
      return { success: false, balance: 0, error: data.msg || "KuCoin API error" };
    }
    
    let balance = 0;
    for (const account of data.data || []) {
      if (account.currency === "USDT") {
        balance += parseFloat(account.balance) || 0;
      }
    }
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testHyperliquid(apiKey: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "clearinghouseState",
        user: apiKey,
      }),
    });
    
    if (!response.ok) {
      return { success: false, balance: 0, error: `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    const balance = parseFloat(data.marginSummary?.accountValue) || 0;
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function testNexo(apiKey: string, apiSecret: string): Promise<{ success: boolean; balance: number; error?: string }> {
  try {
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
      return { success: false, balance: 0, error: `API Error: ${response.status}` };
    }
    
    const data = await response.json();
    let balance = 0;
    
    for (const asset of data.balances || []) {
      if (asset.assetName === "USDT" || asset.assetName === "USDX") {
        balance += parseFloat(asset.totalBalance) || 0;
      }
    }
    
    return { success: true, balance };
  } catch (error) {
    return { success: false, balance: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, apiKey, apiSecret, passphrase } = await req.json();
    
    console.log(`Testing connection for ${exchange}...`);
    
    let result: { success: boolean; balance: number; error?: string };
    
    switch (exchange) {
      case "binance":
        result = await testBinance(apiKey, apiSecret);
        break;
      case "okx":
        result = await testOKX(apiKey, apiSecret, passphrase || "");
        break;
      case "bybit":
        result = await testBybit(apiKey, apiSecret);
        break;
      case "kucoin":
        result = await testKuCoin(apiKey, apiSecret, passphrase || "");
        break;
      case "hyperliquid":
        result = await testHyperliquid(apiKey);
        break;
      case "nexo":
        result = await testNexo(apiKey, apiSecret);
        break;
      default:
        result = { success: false, balance: 0, error: `Unknown exchange: ${exchange}` };
    }

    console.log(`Test result for ${exchange}:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in test-connection:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

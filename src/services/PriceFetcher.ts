// REST API fallback for fetching prices via server-side proxy (no CORS issues)

import { supabase } from '@/integrations/supabase/client';

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

// Track last error log time to prevent console spam
let lastErrorLogTime = 0;
const ERROR_LOG_INTERVAL = 60000; // Only log errors once per minute

// Fetch prices via edge function proxy (bypasses CORS)
export async function fetchAllPrices(symbols: string[], silent = false): Promise<PriceData[]> {
  try {
    const { data, error } = await supabase.functions.invoke('price-proxy');
    
    if (error) {
      throw new Error(error.message);
    }
    
    if (!data?.success || !data?.data) {
      throw new Error('Invalid response from price proxy');
    }
    
    const results: PriceData[] = [];
    
    if (data.source === 'binance') {
      // Parse Binance format
      for (const ticker of data.data) {
        const symbol = ticker.symbol?.replace('USDT', '/USDT');
        if (symbols.includes(symbol)) {
          results.push({
            symbol,
            price: parseFloat(ticker.lastPrice) || 0,
            change24h: parseFloat(ticker.priceChangePercent) || 0,
            volume24h: parseFloat(ticker.volume) || 0,
            high24h: parseFloat(ticker.highPrice) || 0,
            low24h: parseFloat(ticker.lowPrice) || 0,
          });
        }
      }
    } else if (data.source === 'okx') {
      // Parse OKX format
      for (const ticker of data.data) {
        const symbol = ticker.instId?.replace('-', '/');
        if (symbols.includes(symbol)) {
          const price = parseFloat(ticker.last) || 0;
          const open = parseFloat(ticker.open24h) || 0;
          results.push({
            symbol,
            price,
            change24h: open > 0 ? ((price - open) / open) * 100 : 0,
            volume24h: parseFloat(ticker.vol24h) || 0,
            high24h: parseFloat(ticker.high24h) || 0,
            low24h: parseFloat(ticker.low24h) || 0,
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    const now = Date.now();
    if (!silent && now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
      console.warn('Price proxy unavailable, relying on WebSocket:', error);
      lastErrorLogTime = now;
    }
    return [];
  }
}

// Legacy exports for compatibility (now just wrappers)
export async function fetchBinancePrices(symbols: string[]): Promise<PriceData[]> {
  return fetchAllPrices(symbols);
}

export async function fetchOKXPrices(symbols: string[]): Promise<PriceData[]> {
  return fetchAllPrices(symbols);
}

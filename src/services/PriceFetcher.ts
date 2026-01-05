// REST API fallback for fetching prices when WebSocket fails

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

const BINANCE_API = 'https://api.binance.com/api/v3';

export async function fetchBinancePrices(symbols: string[]): Promise<PriceData[]> {
  try {
    // Fetch 24hr ticker data which includes price, volume, and changes
    const response = await fetch(`${BINANCE_API}/ticker/24hr`);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter and transform to our symbols format
    const results: PriceData[] = [];
    
    for (const ticker of data) {
      // Convert BTCUSDT to BTC/USDT format
      const symbol = ticker.symbol.replace('USDT', '/USDT');
      
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
    
    return results;
  } catch (error) {
    console.error('Error fetching Binance prices:', error);
    throw error;
  }
}

export async function fetchOKXPrices(symbols: string[]): Promise<PriceData[]> {
  try {
    const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    
    if (!response.ok) {
      throw new Error(`OKX API error: ${response.status}`);
    }
    
    const data = await response.json();
    const results: PriceData[] = [];
    
    for (const ticker of data.data || []) {
      // Convert BTC-USDT to BTC/USDT format
      const symbol = ticker.instId.replace('-', '/');
      
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
    
    return results;
  } catch (error) {
    console.error('Error fetching OKX prices:', error);
    throw error;
  }
}

// Track last error log time to prevent console spam
let lastErrorLogTime = 0;
const ERROR_LOG_INTERVAL = 60000; // Only log errors once per minute

// Unified price fetcher with fallback
export async function fetchAllPrices(symbols: string[], silent = false): Promise<PriceData[]> {
  try {
    // Try Binance first (most reliable for crypto prices)
    return await fetchBinancePrices(symbols);
  } catch (binanceError) {
    const now = Date.now();
    if (!silent && now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
      console.warn('Binance API unavailable (CORS), using OKX fallback');
      lastErrorLogTime = now;
    }
    
    try {
      return await fetchOKXPrices(symbols);
    } catch (okxError) {
      if (!silent && now - lastErrorLogTime > ERROR_LOG_INTERVAL) {
        console.warn('All REST price APIs unavailable, relying on WebSocket');
        lastErrorLogTime = now;
      }
      return [];
    }
  }
}

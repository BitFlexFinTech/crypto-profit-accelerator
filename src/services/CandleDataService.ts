import { CandleData, Timeframe, TIMEFRAME_MS } from '@/types/charts';

const EXCHANGE_ENDPOINTS: Record<string, string> = {
  binance: 'https://api.binance.com/api/v3/klines',
  okx: 'https://www.okx.com/api/v5/market/candles',
  bybit: 'https://api.bybit.com/v5/market/kline',
  kucoin: 'https://api.kucoin.com/api/v1/market/candles',
};

const OKX_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
};

const BYBIT_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

const KUCOIN_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1hour',
  '4h': '4hour',
  '1d': '1day',
};

class CandleDataService {
  private cache: Map<string, { data: CandleData[]; timestamp: number }> = new Map();
  private cacheTimeout = 30000; // 30 seconds

  private getCacheKey(symbol: string, exchange: string, timeframe: Timeframe): string {
    return `${exchange}-${symbol}-${timeframe}`;
  }

  async fetchCandles(
    symbol: string,
    exchange: string,
    timeframe: Timeframe,
    limit: number = 200
  ): Promise<CandleData[]> {
    const cacheKey = this.getCacheKey(symbol, exchange, timeframe);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      let candles: CandleData[];
      
      switch (exchange.toLowerCase()) {
        case 'binance':
          candles = await this.fetchBinanceCandles(symbol, timeframe, limit);
          break;
        case 'okx':
          candles = await this.fetchOKXCandles(symbol, timeframe, limit);
          break;
        case 'bybit':
          candles = await this.fetchBybitCandles(symbol, timeframe, limit);
          break;
        case 'kucoin':
          candles = await this.fetchKuCoinCandles(symbol, timeframe, limit);
          break;
        default:
          candles = await this.fetchBinanceCandles(symbol, timeframe, limit);
      }

      this.cache.set(cacheKey, { data: candles, timestamp: Date.now() });
      return candles;
    } catch (error) {
      console.error(`Error fetching candles for ${symbol} from ${exchange}:`, error);
      // Return cached data even if expired, or empty array
      return cached?.data || [];
    }
  }

  private async fetchBinanceCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<CandleData[]> {
    const url = `${EXCHANGE_ENDPOINTS.binance}?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();

    return data.map((candle: any[]) => ({
      time: Math.floor(candle[0] / 1000),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  }

  private async fetchOKXCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<CandleData[]> {
    const instId = symbol.replace('USDT', '-USDT');
    const bar = OKX_TIMEFRAMES[timeframe];
    const url = `${EXCHANGE_ENDPOINTS.okx}?instId=${instId}&bar=${bar}&limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data) return [];

    return data.data.map((candle: string[]) => ({
      time: Math.floor(parseInt(candle[0]) / 1000),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    })).reverse();
  }

  private async fetchBybitCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<CandleData[]> {
    const interval = BYBIT_TIMEFRAMES[timeframe];
    const url = `${EXCHANGE_ENDPOINTS.bybit}?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.result?.list) return [];

    return data.result.list.map((candle: string[]) => ({
      time: Math.floor(parseInt(candle[0]) / 1000),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    })).reverse();
  }

  private async fetchKuCoinCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<CandleData[]> {
    const kucoinSymbol = symbol.replace('USDT', '-USDT');
    const type = KUCOIN_TIMEFRAMES[timeframe];
    const endAt = Math.floor(Date.now() / 1000);
    const startAt = endAt - (limit * (TIMEFRAME_MS[timeframe] / 1000));
    
    const url = `${EXCHANGE_ENDPOINTS.kucoin}?symbol=${kucoinSymbol}&type=${type}&startAt=${startAt}&endAt=${endAt}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data) return [];

    return data.data.map((candle: string[]) => ({
      time: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      close: parseFloat(candle[2]),
      high: parseFloat(candle[3]),
      low: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    })).reverse();
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const candleDataService = new CandleDataService();

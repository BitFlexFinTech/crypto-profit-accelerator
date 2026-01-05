// Centralized WebSocket Manager for Real-Time Price Streaming
// Connects to ALL exchanges simultaneously for instant price updates

type ExchangeName = 'binance' | 'okx' | 'bybit' | 'kucoin' | 'hyperliquid';

interface PriceUpdate {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
  exchange: ExchangeName;
}

interface ConnectionState {
  connected: boolean;
  lastPing: number;
  reconnectAttempts: number;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  latency: number;
}

type PriceCallback = (update: PriceUpdate) => void;

// TOP 20 high-liquidity pairs for instant trading
const TOP_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT',
  'BNB/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT',
  'MATIC/USDT', 'ATOM/USDT', 'UNI/USDT', 'LTC/USDT', 'FIL/USDT',
  'APT/USDT', 'ARB/USDT', 'OP/USDT', 'NEAR/USDT', 'INJ/USDT',
];

const WS_ENDPOINTS: Record<string, string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/spot',
};

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const PING_INTERVAL = 30000;

class ExchangeWebSocketManager {
  private static instance: ExchangeWebSocketManager | null = null;
  
  private websockets: Map<ExchangeName, WebSocket> = new Map();
  private connectionStates: Map<ExchangeName, ConnectionState> = new Map();
  private reconnectTimeouts: Map<ExchangeName, NodeJS.Timeout> = new Map();
  private pingIntervals: Map<ExchangeName, NodeJS.Timeout> = new Map();
  private priceCallbacks: Set<PriceCallback> = new Set();
  private latestPrices: Map<string, PriceUpdate> = new Map();
  private subscribedSymbols: Set<string> = new Set(TOP_PAIRS);
  private isInitialized = false;
  
  // RTT tracking for real latency measurement
  private lastPingSentAt: Map<ExchangeName, number> = new Map();

  private constructor() {
    // Initialize connection states
    (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(exchange => {
      this.connectionStates.set(exchange, {
        connected: false,
        lastPing: 0,
        reconnectAttempts: 0,
        status: 'disconnected',
        latency: 0,
      });
    });
  }

  static getInstance(): ExchangeWebSocketManager {
    if (!ExchangeWebSocketManager.instance) {
      ExchangeWebSocketManager.instance = new ExchangeWebSocketManager();
    }
    return ExchangeWebSocketManager.instance;
  }

  // Connect to all exchanges
  connectAll(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    console.log('🔌 WebSocket Manager: Connecting to all exchanges...');
    this.connectToBinance();
    this.connectToOKX();
    this.connectToBybit();
  }

  // Subscribe to price updates
  onPriceUpdate(callback: PriceCallback): () => void {
    this.priceCallbacks.add(callback);
    
    // Send current prices immediately
    this.latestPrices.forEach(price => callback(price));
    
    return () => {
      this.priceCallbacks.delete(callback);
    };
  }

  // Add symbols to subscription
  addSymbols(symbols: string[]): void {
    const newSymbols = symbols.filter(s => !this.subscribedSymbols.has(s));
    if (newSymbols.length === 0) return;
    
    newSymbols.forEach(s => this.subscribedSymbols.add(s));
    
    // Reconnect to update subscriptions
    this.websockets.forEach((ws, exchange) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.subscribeToSymbols(exchange, newSymbols);
      }
    });
  }

  // Get latest price for a symbol
  getLatestPrice(symbol: string): number | null {
    return this.latestPrices.get(symbol)?.price || null;
  }

  // Get all latest prices
  getAllPrices(): Map<string, PriceUpdate> {
    return new Map(this.latestPrices);
  }

  // Get connection status for all exchanges
  getConnectionStatus(): Record<ExchangeName, ConnectionState> {
    const result: Partial<Record<ExchangeName, ConnectionState>> = {};
    this.connectionStates.forEach((state, exchange) => {
      result[exchange] = { ...state };
    });
    return result as Record<ExchangeName, ConnectionState>;
  }

  // Get average latency across all connections
  getAverageLatency(): number {
    let total = 0;
    let count = 0;
    this.connectionStates.forEach(state => {
      if (state.connected && state.latency > 0) {
        total += state.latency;
        count++;
      }
    });
    return count > 0 ? Math.round(total / count) : 0;
  }

  // Check if any exchange is connected
  isAnyConnected(): boolean {
    let connected = false;
    this.connectionStates.forEach(state => {
      if (state.connected) connected = true;
    });
    return connected;
  }

  // Broadcast price update to all subscribers
  private broadcastPrice(update: PriceUpdate): void {
    this.latestPrices.set(update.symbol, update);
    this.priceCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (e) {
        console.error('Price callback error:', e);
      }
    });
  }

  // Connect to Binance WebSocket
  private connectToBinance(): void {
    const exchange: ExchangeName = 'binance';
    this.clearReconnectTimeout(exchange);
    
    this.updateConnectionState(exchange, { status: 'connecting' });
    
    const symbols = Array.from(this.subscribedSymbols);
    const streams = symbols.map(s => s.replace('/', '').toLowerCase() + '@ticker').join('/');
    
    try {
      const ws = new WebSocket(`${WS_ENDPOINTS.binance}/${streams}`);
      const connectTime = Date.now();
      
      ws.onopen = () => {
        console.log(`✅ Binance WebSocket connected`);
        // Don't use handshake time as RTT - set to 0 (neutral)
        // Binance doesn't support app-level ping/pong, so we rely on message activity
        this.updateConnectionState(exchange, {
          connected: true,
          status: 'connected',
          lastPing: Date.now(),
          reconnectAttempts: 0,
          latency: 0, // Neutral - no RTT measurement for Binance
        });
        this.startPingInterval(exchange, ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.s && data.c) {
            const symbol = data.s.replace('USDT', '/USDT');
            this.broadcastPrice({
              symbol,
              price: parseFloat(data.c),
              change24h: parseFloat(data.P) || 0,
              volume24h: parseFloat(data.v) || 0,
              high24h: parseFloat(data.h) || 0,
              low24h: parseFloat(data.l) || 0,
              timestamp: Date.now(),
              exchange,
            });
            this.updateConnectionState(exchange, { lastPing: Date.now() });
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        console.error('Binance WebSocket error:', error);
        this.updateConnectionState(exchange, { status: 'error' });
      };

      ws.onclose = () => {
        console.log('Binance WebSocket closed');
        this.updateConnectionState(exchange, { connected: false, status: 'disconnected' });
        this.clearPingInterval(exchange);
        this.scheduleReconnect(exchange, () => this.connectToBinance());
      };

      this.websockets.set(exchange, ws);
    } catch (error) {
      console.error('Failed to create Binance WebSocket:', error);
      this.scheduleReconnect(exchange, () => this.connectToBinance());
    }
  }

  // Connect to OKX WebSocket
  private connectToOKX(): void {
    const exchange: ExchangeName = 'okx';
    this.clearReconnectTimeout(exchange);
    
    this.updateConnectionState(exchange, { status: 'connecting' });
    
    try {
      const ws = new WebSocket(WS_ENDPOINTS.okx);
      const connectTime = Date.now();
      
      ws.onopen = () => {
        console.log(`✅ OKX WebSocket connected`);
        
        // Subscribe to tickers
        const symbols = Array.from(this.subscribedSymbols);
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: symbols.map(s => ({ channel: 'tickers', instId: s.replace('/', '-') })),
        }));
        
        // Don't use handshake time as RTT - set to 0 (neutral) until real ping/pong
        this.updateConnectionState(exchange, {
          connected: true,
          status: 'connected',
          lastPing: Date.now(),
          reconnectAttempts: 0,
          latency: 0, // Will be updated by ping/pong
        });
        this.startPingInterval(exchange, ws);
      };

      ws.onmessage = (event) => {
        try {
          // Handle pong response for RTT measurement
          if (event.data === 'pong') {
            const sentAt = this.lastPingSentAt.get(exchange);
            if (sentAt) {
              const rtt = Date.now() - sentAt;
              this.updateConnectionState(exchange, { latency: rtt, lastPing: Date.now() });
            }
            return;
          }
          
          const data = JSON.parse(event.data);
          if (data.data?.[0]) {
            const ticker = data.data[0];
            const symbol = ticker.instId.replace('-', '/');
            const price = parseFloat(ticker.last);
            const open24h = parseFloat(ticker.open24h) || price;
            
            this.broadcastPrice({
              symbol,
              price,
              change24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
              volume24h: parseFloat(ticker.vol24h) || 0,
              high24h: parseFloat(ticker.high24h) || price,
              low24h: parseFloat(ticker.low24h) || price,
              timestamp: Date.now(),
              exchange,
            });
            this.updateConnectionState(exchange, { lastPing: Date.now() });
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        console.error('OKX WebSocket error:', error);
        this.updateConnectionState(exchange, { status: 'error' });
      };

      ws.onclose = () => {
        console.log('OKX WebSocket closed');
        this.updateConnectionState(exchange, { connected: false, status: 'disconnected' });
        this.clearPingInterval(exchange);
        this.scheduleReconnect(exchange, () => this.connectToOKX());
      };

      this.websockets.set(exchange, ws);
    } catch (error) {
      console.error('Failed to create OKX WebSocket:', error);
      this.scheduleReconnect(exchange, () => this.connectToOKX());
    }
  }

  // Connect to Bybit WebSocket
  private connectToBybit(): void {
    const exchange: ExchangeName = 'bybit';
    this.clearReconnectTimeout(exchange);
    
    this.updateConnectionState(exchange, { status: 'connecting' });
    
    try {
      const ws = new WebSocket(WS_ENDPOINTS.bybit);
      const connectTime = Date.now();
      
      ws.onopen = () => {
        console.log(`✅ Bybit WebSocket connected`);
        
        // Subscribe to tickers
        const symbols = Array.from(this.subscribedSymbols);
        ws.send(JSON.stringify({
          op: 'subscribe',
          args: symbols.map(s => `tickers.${s.replace('/', '')}`),
        }));
        
        // Don't use handshake time as RTT - set to 0 (neutral) until real ping/pong
        this.updateConnectionState(exchange, {
          connected: true,
          status: 'connected',
          lastPing: Date.now(),
          reconnectAttempts: 0,
          latency: 0, // Will be updated by ping/pong
        });
        this.startPingInterval(exchange, ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong response for RTT measurement
          if (data.op === 'pong' || data.ret_msg === 'pong') {
            const sentAt = this.lastPingSentAt.get(exchange);
            if (sentAt) {
              const rtt = Date.now() - sentAt;
              this.updateConnectionState(exchange, { latency: rtt, lastPing: Date.now() });
            }
            return;
          }
          
          if (data.data && data.topic?.startsWith('tickers.')) {
            const symbol = data.topic.replace('tickers.', '').replace('USDT', '/USDT');
            
            this.broadcastPrice({
              symbol,
              price: parseFloat(data.data.lastPrice),
              change24h: parseFloat(data.data.price24hPcnt) * 100 || 0,
              volume24h: parseFloat(data.data.volume24h) || 0,
              high24h: parseFloat(data.data.highPrice24h) || 0,
              low24h: parseFloat(data.data.lowPrice24h) || 0,
              timestamp: Date.now(),
              exchange,
            });
            this.updateConnectionState(exchange, { lastPing: Date.now() });
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        console.error('Bybit WebSocket error:', error);
        this.updateConnectionState(exchange, { status: 'error' });
      };

      ws.onclose = () => {
        console.log('Bybit WebSocket closed');
        this.updateConnectionState(exchange, { connected: false, status: 'disconnected' });
        this.clearPingInterval(exchange);
        this.scheduleReconnect(exchange, () => this.connectToBybit());
      };

      this.websockets.set(exchange, ws);
    } catch (error) {
      console.error('Failed to create Bybit WebSocket:', error);
      this.scheduleReconnect(exchange, () => this.connectToBybit());
    }
  }

  // Subscribe to additional symbols on an open connection
  private subscribeToSymbols(exchange: ExchangeName, symbols: string[]): void {
    const ws = this.websockets.get(exchange);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (exchange === 'okx') {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: symbols.map(s => ({ channel: 'tickers', instId: s.replace('/', '-') })),
      }));
    } else if (exchange === 'bybit') {
      ws.send(JSON.stringify({
        op: 'subscribe',
        args: symbols.map(s => `tickers.${s.replace('/', '')}`),
      }));
    }
    // Binance requires reconnection for new subscriptions
  }

  // Update connection state
  private updateConnectionState(exchange: ExchangeName, update: Partial<ConnectionState>): void {
    const current = this.connectionStates.get(exchange) || {
      connected: false,
      lastPing: 0,
      reconnectAttempts: 0,
      status: 'disconnected' as const,
      latency: 0,
    };
    this.connectionStates.set(exchange, { ...current, ...update });
  }

  // Schedule reconnection with exponential backoff
  private scheduleReconnect(exchange: ExchangeName, connectFn: () => void): void {
    const state = this.connectionStates.get(exchange);
    const attempts = (state?.reconnectAttempts || 0) + 1;
    
    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnection attempts reached for ${exchange}`);
      this.updateConnectionState(exchange, { status: 'error' });
      return;
    }
    
    this.updateConnectionState(exchange, { reconnectAttempts: attempts });
    
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempts - 1);
    console.log(`Reconnecting to ${exchange} in ${delay}ms (attempt ${attempts})`);
    
    const timeout = setTimeout(connectFn, delay);
    this.reconnectTimeouts.set(exchange, timeout);
  }

  // Clear reconnect timeout
  private clearReconnectTimeout(exchange: ExchangeName): void {
    const timeout = this.reconnectTimeouts.get(exchange);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(exchange);
    }
  }

  // Start ping interval to keep connection alive and measure RTT
  private startPingInterval(exchange: ExchangeName, ws: WebSocket): void {
    this.clearPingInterval(exchange);
    
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          if (exchange === 'okx') {
            this.lastPingSentAt.set(exchange, Date.now());
            ws.send('ping');
          } else if (exchange === 'bybit') {
            this.lastPingSentAt.set(exchange, Date.now());
            ws.send(JSON.stringify({ op: 'ping' }));
          }
          // Binance doesn't require explicit ping - latency stays 0
        } catch (e) {
          // Ignore
        }
      }
    }, PING_INTERVAL);
    
    this.pingIntervals.set(exchange, interval);
  }

  // Clear ping interval
  private clearPingInterval(exchange: ExchangeName): void {
    const interval = this.pingIntervals.get(exchange);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(exchange);
    }
  }

  // Disconnect all
  disconnectAll(): void {
    this.websockets.forEach((ws, exchange) => {
      this.clearPingInterval(exchange);
      this.clearReconnectTimeout(exchange);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.websockets.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const wsManager = ExchangeWebSocketManager.getInstance();
export type { PriceUpdate, ConnectionState };

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Position, Exchange, Balance, BotSettings, Trade } from '@/types/trading';
import { rateLimiter } from '@/services/RateLimiter';
import { invokeWithRetry } from '@/utils/retryWithBackoff';

type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

interface TradingSignal {
  exchange: string;
  symbol: string;
  direction: 'long' | 'short';
  score: number;
  confidence: number;
  volatility: 'low' | 'medium' | 'high';
  momentum: 'bearish' | 'neutral' | 'bullish';
  estimatedTimeToProfit: string;
  entryPrice: number;
  targetPrice: number;
  reasoning: string;
  tradeType: 'spot' | 'futures';
}

interface ConnectionState {
  connected: boolean;
  lastPing: Date | null;
  latency: number;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
}

interface EngineMetrics {
  cycleTime: number;
  analysisTime: number;
  executionTime: number;
  tradesPerHour: number;
  successRate: number;
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  volatility: number;
  lastUpdate: Date;
}

interface TradingContextType {
  // Data
  prices: Record<string, number>;
  positions: Position[];
  exchanges: Exchange[];
  balances: Balance[];
  settings: BotSettings | null;
  signals: TradingSignal[];
  trades: Trade[];
  marketData: MarketData[];
  
  // Connection states
  connectionStates: Record<string, ConnectionState>;
  
  // Engine state
  engineStatus: 'idle' | 'analyzing' | 'trading' | 'monitoring' | 'error';
  engineMetrics: EngineMetrics;
  isEngineRunning: boolean;
  
  // Loading states
  loading: boolean;
  
  // Actions
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  forceAnalyze: () => Promise<TradingSignal[]>;
  closePosition: (positionId: string) => Promise<void>;
  closeAllPositions: () => Promise<void>;
  refreshData: () => Promise<void>;
  syncBalances: () => Promise<void>;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

const WS_ENDPOINTS: Record<string, string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/spot',
};

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export function TradingProvider({ children }: { children: ReactNode }) {
  // Core state
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  
  // Connection states
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({});
  
  // Engine state
  const [engineStatus, setEngineStatus] = useState<'idle' | 'analyzing' | 'trading' | 'monitoring' | 'error'>('idle');
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics>({
    cycleTime: 0,
    analysisTime: 0,
    executionTime: 0,
    tradesPerHour: 0,
    successRate: 0,
  });
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Refs
  const wsRefs = useRef<Record<string, WebSocket>>({});
  const reconnectTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const tradingLoopRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      const [exchangesRes, balancesRes, positionsRes, settingsRes, tradesRes] = await Promise.all([
        supabase.from('exchanges').select('*'),
        supabase.from('balances').select('*'),
        supabase.from('positions').select('*').eq('status', 'open'),
        supabase.from('bot_settings').select('*').maybeSingle(),
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (exchangesRes.data) setExchanges(exchangesRes.data as Exchange[]);
      if (balancesRes.data) {
        setBalances(balancesRes.data.map(b => ({
          ...b,
          available: Number(b.available),
          locked: Number(b.locked),
          total: Number(b.total),
        })) as Balance[]);
      }
      if (positionsRes.data) {
        setPositions(positionsRes.data.map(p => ({
          ...p,
          entry_price: Number(p.entry_price),
          current_price: p.current_price ? Number(p.current_price) : undefined,
          quantity: Number(p.quantity),
          order_size_usd: Number(p.order_size_usd),
          unrealized_pnl: Number(p.unrealized_pnl),
          profit_target: Number(p.profit_target),
        })) as Position[]);
      }
      if (settingsRes.data) {
        setSettings({
          ...settingsRes.data,
          min_order_size: Number(settingsRes.data.min_order_size),
          max_order_size: Number(settingsRes.data.max_order_size),
          spot_profit_target: Number(settingsRes.data.spot_profit_target),
          futures_profit_target: Number(settingsRes.data.futures_profit_target),
          daily_loss_limit: Number(settingsRes.data.daily_loss_limit),
        } as BotSettings);
        setIsEngineRunning(settingsRes.data.is_bot_running || false);
      } else {
        // Create default settings
        const { data } = await supabase
          .from('bot_settings')
          .insert({
            user_id: DEFAULT_USER_ID,
            is_bot_running: false,
            min_order_size: 333.00,
            max_order_size: 450.00,
            spot_profit_target: 1.00,
            futures_profit_target: 3.00,
            daily_loss_limit: 50.00,
            max_open_positions: 10,
            ai_aggressiveness: 'balanced',
          })
          .select()
          .single();
        if (data) setSettings(data as BotSettings);
      }
      if (tradesRes.data) setTrades(tradesRes.data as Trade[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection for price updates
  const connectToExchange = useCallback((exchange: ExchangeName, symbols: string[]) => {
    if (symbols.length === 0 || !WS_ENDPOINTS[exchange]) return;

    const connectWs = () => {
      let ws: WebSocket;
      
      if (exchange === 'binance') {
        const streams = symbols.map(s => s.replace('/', '').toLowerCase() + '@ticker').join('/');
        ws = new WebSocket(`${WS_ENDPOINTS.binance}/${streams}`);
      } else {
        ws = new WebSocket(WS_ENDPOINTS[exchange]);
      }

      ws.onopen = () => {
        console.log(`${exchange} WebSocket connected`);
        setConnectionStates(prev => ({
          ...prev,
          [exchange]: { connected: true, lastPing: new Date(), latency: 0, status: 'connected' },
        }));

        // Subscribe for OKX/Bybit
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
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          let symbol: string | null = null;
          let price: number | null = null;

          if (exchange === 'binance' && data.s && data.c) {
            symbol = data.s.replace('USDT', '/USDT');
            price = parseFloat(data.c);
          } else if (exchange === 'okx' && data.data?.[0]) {
            symbol = data.data[0].instId.replace('-', '/');
            price = parseFloat(data.data[0].last);
          } else if (exchange === 'bybit' && data.data && data.topic?.startsWith('tickers.')) {
            symbol = data.topic.replace('tickers.', '').replace('USDT', '/USDT');
            price = parseFloat(data.data.lastPrice);
          }

          if (symbol && price) {
            setPrices(prev => ({ ...prev, [symbol!]: price! }));
            setConnectionStates(prev => ({
              ...prev,
              [exchange]: { ...prev[exchange], lastPing: new Date() },
            }));
          }
        } catch (e) {
          console.error(`Error parsing ${exchange} message:`, e);
        }
      };

      ws.onerror = () => {
        setConnectionStates(prev => ({
          ...prev,
          [exchange]: { ...prev[exchange], connected: false, status: 'error' },
        }));
      };

      ws.onclose = () => {
        setConnectionStates(prev => ({
          ...prev,
          [exchange]: { ...prev[exchange], connected: false, status: 'disconnected' },
        }));
        
        // Reconnect with exponential backoff
        reconnectTimeouts.current[exchange] = setTimeout(() => connectWs(), 5000);
      };

      wsRefs.current[exchange] = ws;
    };

    connectWs();
  }, []);

  // Health check for connections
  const runHealthCheck = useCallback(() => {
    const now = Date.now();
    Object.entries(connectionStates).forEach(([exchange, state]) => {
      if (state.lastPing && now - state.lastPing.getTime() > 30000) {
        // No ping in 30 seconds, reconnect
        const ws = wsRefs.current[exchange];
        if (ws) {
          ws.close();
        }
      }
    });
  }, [connectionStates]);

  // Start bot
  const startBot = useCallback(async () => {
    if (!settings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: true })
        .eq('id', settings.id);
      
      setIsEngineRunning(true);
      setSettings(prev => prev ? { ...prev, is_bot_running: true } : null);
      setEngineStatus('monitoring');
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  }, [settings]);

  // Stop bot
  const stopBot = useCallback(async () => {
    if (!settings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: false })
        .eq('id', settings.id);
      
      setIsEngineRunning(false);
      setSettings(prev => prev ? { ...prev, is_bot_running: false } : null);
      setEngineStatus('idle');
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  }, [settings]);

  // Analyze pairs
  const forceAnalyze = useCallback(async (): Promise<TradingSignal[]> => {
    if (!settings) return [];
    
    setEngineStatus('analyzing');
    const startTime = Date.now();
    
    try {
      const connectedExchanges = exchanges.filter(e => e.is_connected).map(e => e.exchange);
      if (connectedExchanges.length === 0) return [];

      const data = await invokeWithRetry(() => 
        supabase.functions.invoke('analyze-pairs', {
          body: {
            exchanges: connectedExchanges,
            mode: exchanges.some(e => e.futures_enabled) ? 'both' : 'spot',
            aggressiveness: settings.ai_aggressiveness || 'balanced',
          },
        })
      );

      const newSignals = data?.signals || [];
      setSignals(newSignals);
      setEngineMetrics(prev => ({
        ...prev,
        analysisTime: Date.now() - startTime,
      }));
      setEngineStatus('monitoring');
      
      return newSignals;
    } catch (error) {
      console.error('Error analyzing pairs:', error);
      setEngineStatus('error');
      return [];
    }
  }, [settings, exchanges]);

  // Close position
  const closePosition = useCallback(async (positionId: string) => {
    try {
      await invokeWithRetry(() => 
        supabase.functions.invoke('close-position', { body: { positionId } })
      );
      
      setPositions(prev => prev.filter(p => p.id !== positionId));
    } catch (error) {
      console.error('Error closing position:', error);
      throw error;
    }
  }, []);

  // Close all positions
  const closeAllPositions = useCallback(async () => {
    try {
      await Promise.all(
        positions.map(p => 
          invokeWithRetry(() => 
            supabase.functions.invoke('close-position', { body: { positionId: p.id } })
          )
        )
      );
      setPositions([]);
    } catch (error) {
      console.error('Error closing all positions:', error);
      throw error;
    }
  }, [positions]);

  // Sync balances
  const syncBalances = useCallback(async () => {
    try {
      await invokeWithRetry(() => supabase.functions.invoke('sync-balances'));
      
      const { data } = await supabase.from('balances').select('*');
      if (data) {
        setBalances(data.map(b => ({
          ...b,
          available: Number(b.available),
          locked: Number(b.locked),
          total: Number(b.total),
        })) as Balance[]);
      }
    } catch (error) {
      console.error('Error syncing balances:', error);
      throw error;
    }
  }, []);

  // Initialize
  useEffect(() => {
    fetchAllData();
    
    // Set up real-time subscriptions
    const positionsChannel = supabase
      .channel('positions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => {
        supabase.from('positions').select('*').eq('status', 'open').then(({ data }) => {
          if (data) {
            setPositions(data.map(p => ({
              ...p,
              entry_price: Number(p.entry_price),
              current_price: p.current_price ? Number(p.current_price) : undefined,
              quantity: Number(p.quantity),
              order_size_usd: Number(p.order_size_usd),
              unrealized_pnl: Number(p.unrealized_pnl),
              profit_target: Number(p.profit_target),
            })) as Position[]);
          }
        });
      })
      .subscribe();

    const tradesChannel = supabase
      .channel('trades-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => {
          if (data) setTrades(data as Trade[]);
        });
      })
      .subscribe();

    // Health check interval
    healthCheckRef.current = setInterval(runHealthCheck, 10000);

    return () => {
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(tradesChannel);
      Object.values(wsRefs.current).forEach(ws => ws.close());
      Object.values(reconnectTimeouts.current).forEach(t => clearTimeout(t));
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (tradingLoopRef.current) clearInterval(tradingLoopRef.current);
    };
  }, [fetchAllData, runHealthCheck]);

  // Connect WebSockets when exchanges change
  useEffect(() => {
    const connectedExchanges = exchanges.filter(e => e.is_connected);
    const defaultSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT'];
    
    connectedExchanges.forEach(exchange => {
      if (!wsRefs.current[exchange.exchange]) {
        connectToExchange(exchange.exchange as ExchangeName, defaultSymbols);
      }
    });
  }, [exchanges, connectToExchange]);

  // Update position prices
  useEffect(() => {
    positions.forEach(position => {
      const currentPrice = prices[position.symbol];
      if (currentPrice && currentPrice !== position.current_price) {
        setPositions(prev => prev.map(p => {
          if (p.id !== position.id) return p;
          
          let pnl: number;
          if (p.direction === 'long') {
            pnl = (currentPrice - p.entry_price) * p.quantity * (p.leverage || 1);
          } else {
            pnl = (p.entry_price - currentPrice) * p.quantity * (p.leverage || 1);
          }
          
          return { ...p, current_price: currentPrice, unrealized_pnl: pnl };
        }));
      }
    });
  }, [prices]);

  const value: TradingContextType = {
    prices,
    positions,
    exchanges,
    balances,
    settings,
    signals,
    trades,
    marketData,
    connectionStates,
    engineStatus,
    engineMetrics,
    isEngineRunning,
    loading,
    startBot,
    stopBot,
    forceAnalyze,
    closePosition,
    closeAllPositions,
    refreshData: fetchAllData,
    syncBalances,
  };

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (context === undefined) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
}

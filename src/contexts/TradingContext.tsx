import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Position, Exchange, Balance, BotSettings, Trade } from '@/types/trading';
import { rateLimiter } from '@/services/RateLimiter';
import { invokeWithRetry } from '@/utils/retryWithBackoff';
import { fetchAllPrices } from '@/services/PriceFetcher';

type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

export interface TradingSignal {
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
  reconnectAttempts: number;
  usingRestFallback?: boolean;
}

interface EngineMetrics {
  cycleTime: number;
  analysisTime: number;
  executionTime: number;
  tradesPerHour: number;
  successRate: number;
  lastScanTime: Date | null;
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  volatility: number;
  lastUpdate: Date;
}

export interface ExecutionLogEntry {
  timestamp: Date;
  type: 'LOOP_TICK' | 'SIGNALS_RECEIVED' | 'BLOCKED' | 'TRADE_REQUESTED' | 'TRADE_SUCCESS' | 'TRADE_FAILED' | 'WATCHDOG';
  message: string;
  symbol?: string;
  details?: string;
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
  marketData: Record<string, MarketData>;
  executionLogs: ExecutionLogEntry[];
  
  // Connection states
  connectionStates: Record<string, ConnectionState>;
  
  // Engine state
  engineStatus: 'idle' | 'analyzing' | 'trading' | 'monitoring' | 'scanning' | 'error';
  engineMetrics: EngineMetrics;
  isEngineRunning: boolean;
  isScanning: boolean;
  
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
  testTradeTopSignal: () => Promise<void>;
  clearExecutionLogs: () => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// WebSocket endpoints for all supported exchanges
const WS_ENDPOINTS: Record<string, string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/spot',
  kucoin: 'wss://ws-api-spot.kucoin.com',
};

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 'BNB/USDT', 'ADA/USDT', 'AVAX/USDT', 'MATIC/USDT', 'LINK/USDT', 'DOT/USDT', 'ATOM/USDT'];
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;
const REST_FALLBACK_INTERVAL = 2000;
const BACKGROUND_SCAN_INTERVAL = 5000;
const TRADING_LOOP_INTERVAL = 3000;
const PROFIT_CHECK_INTERVAL = 1000;
const WATCHDOG_INTERVAL = 5000;
const MAX_EXECUTION_LOGS = 200;
const MAX_NEW_TRADES_PER_CYCLE = 2; // Execute up to 2 distinct signals per loop cycle
const BALANCE_SYNC_INTERVAL = 30000; // Auto-sync balances every 30 seconds

// LOWERED THRESHOLDS for more trading
const THRESHOLDS = {
  aggressive: { confidence: 0.25, score: 25 },
  balanced: { confidence: 0.35, score: 35 },
  conservative: { confidence: 0.50, score: 45 },
};

export function TradingProvider({ children }: { children: ReactNode }) {
  // Core state
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([]);
  
  // Connection states
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({});
  
  // Engine state
  const [engineStatus, setEngineStatus] = useState<'idle' | 'analyzing' | 'trading' | 'monitoring' | 'scanning' | 'error'>('idle');
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics>({
    cycleTime: 0,
    analysisTime: 0,
    executionTime: 0,
    tradesPerHour: 0,
    successRate: 0,
    lastScanTime: null,
  });
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Refs for stability (prevent closure issues)
  const wsRefs = useRef<Record<string, WebSocket>>({});
  const reconnectTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const tradingLoopRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const restFallbackRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundScanRef = useRef<NodeJS.Timeout | null>(null);
  const profitCheckRef = useRef<NodeJS.Timeout | null>(null);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const balanceSyncRef = useRef<NodeJS.Timeout | null>(null);
  const initialConnectionMade = useRef(false);
  const connectionStatesRef = useRef<Record<string, ConnectionState>>({});
  const hasAutoSynced = useRef(false);
  const isRunningRef = useRef(false);
  const lastProfitCheckRef = useRef<number>(0);
  const lastTradingLoopTickRef = useRef<number>(0);
  // Per-signal cooldown map to allow trading multiple pairs
  const lastExecutedMapRef = useRef<Record<string, number>>({});
  // Track which symbols we're currently subscribed to
  const subscribedSymbolsRef = useRef<Set<string>>(new Set());
  // Track positions currently being closed to prevent duplicate closes
  const closingPositionIdsRef = useRef<Set<string>>(new Set());
  // Flag to prevent overlapping balance syncs
  const isSyncingBalancesRef = useRef(false);
  
  // Stable refs for latest state
  const settingsRef = useRef<BotSettings | null>(null);
  const positionsRef = useRef<Position[]>([]);
  const signalsRef = useRef<TradingSignal[]>([]);
  const exchangesRef = useRef<Exchange[]>([]);
  // Ref for runTradingLoop to break circular dependency
  const runTradingLoopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  
  // Keep refs in sync
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { signalsRef.current = signals; }, [signals]);
  useEffect(() => { exchangesRef.current = exchanges; }, [exchanges]);

  // Add execution log entry (ring buffer)
  const appendExecutionLog = useCallback((entry: Omit<ExecutionLogEntry, 'timestamp'>) => {
    setExecutionLogs(prev => {
      const newLogs = [{ ...entry, timestamp: new Date() }, ...prev];
      return newLogs.slice(0, MAX_EXECUTION_LOGS);
    });
  }, []);

  const clearExecutionLogs = useCallback(() => {
    setExecutionLogs([]);
  }, []);

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
        isRunningRef.current = settingsRes.data.is_bot_running || false;
      } else {
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

  // Build dynamic symbols list (includes position symbols + signal symbols)
  const getDynamicSymbols = useCallback(() => {
    const symbolSet = new Set(DEFAULT_SYMBOLS);
    // Add all open position symbols
    positionsRef.current.forEach(p => symbolSet.add(p.symbol));
    // Add top signal symbols (up to 10)
    signalsRef.current.slice(0, 10).forEach(s => symbolSet.add(s.symbol));
    return Array.from(symbolSet);
  }, []);

  // REST API fallback for fetching prices
  const fetchPricesViaREST = useCallback(async () => {
    try {
      const dynamicSymbols = getDynamicSymbols();
      const priceData = await fetchAllPrices(dynamicSymbols);
      
      if (priceData.length > 0) {
        const newPrices: Record<string, number> = {};
        const newMarketData: Record<string, MarketData> = {};
        
        priceData.forEach(data => {
          newPrices[data.symbol] = data.price;
          newMarketData[data.symbol] = {
            symbol: data.symbol,
            price: data.price,
            change24h: data.change24h,
            volume24h: data.volume24h,
            high24h: data.high24h,
            low24h: data.low24h,
            volatility: data.high24h && data.low24h ? ((data.high24h - data.low24h) / data.low24h) * 100 : 0,
            lastUpdate: new Date(),
          };
        });
        
        setPrices(prev => ({ ...prev, ...newPrices }));
        setMarketData(prev => ({ ...prev, ...newMarketData }));
        
        setConnectionStates(prev => ({
          ...prev,
          rest: { 
            connected: true, 
            lastPing: new Date(), 
            latency: 0, 
            status: 'connected' as const,
            reconnectAttempts: 0,
            usingRestFallback: true,
          },
        }));
      }
    } catch (error) {
      console.error('REST fallback error:', error);
    }
  }, [getDynamicSymbols]);

  // Start REST fallback polling
  const startRestFallback = useCallback(() => {
    if (restFallbackRef.current) return;
    console.log('Starting REST API fallback for price data...');
    fetchPricesViaREST();
    restFallbackRef.current = setInterval(fetchPricesViaREST, REST_FALLBACK_INTERVAL);
  }, [fetchPricesViaREST]);

  // WebSocket connection with reconnection logic
  const connectToExchange = useCallback((exchangeName: ExchangeName) => {
    if (!WS_ENDPOINTS[exchangeName]) {
      console.log(`No WebSocket endpoint for ${exchangeName}`);
      return;
    }

    if (wsRefs.current[exchangeName]) {
      wsRefs.current[exchangeName].close();
    }

    setConnectionStates(prev => {
      const newState = {
        ...prev,
        [exchangeName]: { 
          connected: false, 
          lastPing: null, 
          latency: 0, 
          status: 'connecting' as const,
          reconnectAttempts: prev[exchangeName]?.reconnectAttempts || 0,
        },
      };
      connectionStatesRef.current = newState;
      return newState;
    });

    const connectWs = (symbolsToSubscribe?: string[]) => {
      let ws: WebSocket;
      const symbols = symbolsToSubscribe || getDynamicSymbols();
      subscribedSymbolsRef.current = new Set(symbols);
      
      try {
        if (exchangeName === 'binance') {
          const streams = symbols.map(s => s.replace('/', '').toLowerCase() + '@ticker').join('/');
          ws = new WebSocket(`${WS_ENDPOINTS.binance}/${streams}`);
        } else {
          ws = new WebSocket(WS_ENDPOINTS[exchangeName]);
        }
      } catch (error) {
        console.error(`Failed to create WebSocket for ${exchangeName}:`, error);
        startRestFallback();
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log(`WebSocket connection timeout for ${exchangeName}, using REST fallback`);
          ws.close();
          startRestFallback();
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`${exchangeName} WebSocket connected`);
        setConnectionStates(prev => {
          const newState = {
            ...prev,
            [exchangeName]: { 
              connected: true, 
              lastPing: new Date(), 
              latency: 0, 
              status: 'connected' as const,
              reconnectAttempts: 0,
            },
          };
          connectionStatesRef.current = newState;
          return newState;
        });

        if (exchangeName === 'okx') {
          ws.send(JSON.stringify({
            op: 'subscribe',
            args: symbols.map(s => ({ channel: 'tickers', instId: s.replace('/', '-') })),
          }));
        } else if (exchangeName === 'bybit') {
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
          let volume24h: number | null = null;
          let high24h: number | null = null;
          let low24h: number | null = null;
          let change24h: number | null = null;

          if (exchangeName === 'binance' && data.s && data.c) {
            symbol = data.s.replace('USDT', '/USDT');
            price = parseFloat(data.c);
            volume24h = parseFloat(data.v) || 0;
            high24h = parseFloat(data.h) || 0;
            low24h = parseFloat(data.l) || 0;
            change24h = parseFloat(data.P) || 0;
          } else if (exchangeName === 'okx' && data.data?.[0]) {
            symbol = data.data[0].instId.replace('-', '/');
            price = parseFloat(data.data[0].last);
            volume24h = parseFloat(data.data[0].vol24h) || 0;
            high24h = parseFloat(data.data[0].high24h) || 0;
            low24h = parseFloat(data.data[0].low24h) || 0;
            change24h = ((price - parseFloat(data.data[0].open24h)) / parseFloat(data.data[0].open24h)) * 100;
          } else if (exchangeName === 'bybit' && data.data && data.topic?.startsWith('tickers.')) {
            symbol = data.topic.replace('tickers.', '').replace('USDT', '/USDT');
            price = parseFloat(data.data.lastPrice);
            volume24h = parseFloat(data.data.volume24h) || 0;
            high24h = parseFloat(data.data.highPrice24h) || 0;
            low24h = parseFloat(data.data.lowPrice24h) || 0;
            change24h = parseFloat(data.data.price24hPcnt) * 100 || 0;
          }

          if (symbol && price) {
            setPrices(prev => ({ ...prev, [symbol!]: price! }));
            
            if (volume24h !== null) {
              setMarketData(prev => ({
                ...prev,
                [symbol!]: {
                  symbol: symbol!,
                  price: price!,
                  volume24h: volume24h!,
                  high24h: high24h || price!,
                  low24h: low24h || price!,
                  change24h: change24h || 0,
                  volatility: high24h && low24h ? ((high24h - low24h) / low24h) * 100 : 0,
                  lastUpdate: new Date(),
                },
              }));
            }
            
            setConnectionStates(prev => ({
              ...prev,
              [exchangeName]: { ...prev[exchangeName], lastPing: new Date() },
            }));
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error(`${exchangeName} WebSocket error:`, error);
        setConnectionStates(prev => {
          const newState = {
            ...prev,
            [exchangeName]: { ...prev[exchangeName], connected: false, status: 'error' as const },
          };
          connectionStatesRef.current = newState;
          return newState;
        });
        startRestFallback();
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        console.log(`${exchangeName} WebSocket closed`);
        
        const currentState = connectionStatesRef.current[exchangeName];
        const attempts = (currentState?.reconnectAttempts || 0) + 1;
        
        setConnectionStates(prev => {
          const newState = {
            ...prev,
            [exchangeName]: { 
              ...prev[exchangeName], 
              connected: false, 
              status: 'disconnected' as const,
              reconnectAttempts: attempts,
            },
          };
          connectionStatesRef.current = newState;
          return newState;
        });
        
        if (attempts <= MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempts - 1);
          console.log(`Reconnecting to ${exchangeName} in ${delay}ms (attempt ${attempts})`);
          reconnectTimeouts.current[exchangeName] = setTimeout(() => connectWs(), delay);
        } else {
          console.error(`Max reconnection attempts reached for ${exchangeName}, using REST fallback`);
          setConnectionStates(prev => {
            const newState = {
              ...prev,
              [exchangeName]: { ...prev[exchangeName], status: 'error' as const },
            };
            connectionStatesRef.current = newState;
            return newState;
          });
          startRestFallback();
        }
      };

      wsRefs.current[exchangeName] = ws;
    };

    connectWs();
  }, [startRestFallback]);

  // Health check (stable - uses refs)
  const runHealthCheck = useCallback(() => {
    const now = Date.now();
    let anyConnected = false;
    const states = connectionStatesRef.current;
    
    Object.entries(states).forEach(([exchange, state]) => {
      if (state.connected) anyConnected = true;
      
      if (state.lastPing && now - state.lastPing.getTime() > 30000 && state.status === 'connected') {
        console.log(`No ping from ${exchange} in 30 seconds, reconnecting...`);
        const ws = wsRefs.current[exchange];
        if (ws) ws.close();
      }
    });
    
    if (!anyConnected && !restFallbackRef.current) {
      startRestFallback();
    }
  }, [startRestFallback]);

  // Background AI scanning
  const runBackgroundScan = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    const prevStatus = engineStatus;
    setEngineStatus('scanning');
    
    try {
      const connectedExchanges = exchangesRef.current.filter(e => e.is_connected).map(e => e.exchange);
      if (connectedExchanges.length === 0) {
        setEngineMetrics(prev => ({ ...prev, lastScanTime: new Date() }));
        return;
      }

      const startTime = Date.now();
      const currentSettings = settingsRef.current;
      
      const data = await invokeWithRetry(() => 
        supabase.functions.invoke('analyze-pairs', {
          body: {
            exchanges: connectedExchanges,
            mode: exchangesRef.current.some(e => e.futures_enabled) ? 'both' : 'spot',
            aggressiveness: currentSettings?.ai_aggressiveness || 'balanced',
          },
        })
      );

      const newSignals = data?.signals || [];
      setSignals(newSignals);
      setEngineMetrics(prev => ({
        ...prev,
        analysisTime: Date.now() - startTime,
        lastScanTime: new Date(),
      }));
      
      if (newSignals.length > 0) {
        appendExecutionLog({
          type: 'SIGNALS_RECEIVED',
          message: `AI returned ${newSignals.length} signals. Top: ${newSignals[0].symbol} (score=${newSignals[0].score}, conf=${(newSignals[0].confidence * 100).toFixed(0)}%)`,
          symbol: newSignals[0].symbol,
        });
      }
      
      console.log(`Background scan complete: ${newSignals.length} signals found`);
    } catch (error) {
      console.error('Background scan error:', error);
    } finally {
      setIsScanning(false);
      setEngineStatus(isRunningRef.current ? 'monitoring' : 'idle');
    }
  }, [isScanning, engineStatus, appendExecutionLog]);

  // Calculate net PnL including ALL fees (same formula as edge function)
  const calculateNetPnL = useCallback((position: Position, currentPrice: number): number => {
    const feeRate = position.trade_type === 'spot' ? 0.001 : 0.0005;
    const entryFee = position.order_size_usd * feeRate;
    const exitFee = position.order_size_usd * feeRate;
    const fundingFee = position.trade_type === 'futures' ? position.order_size_usd * 0.0001 : 0;
    
    let grossPnL: number;
    if (position.direction === 'long') {
      grossPnL = (currentPrice - position.entry_price) * position.quantity * (position.leverage || 1);
    } else {
      grossPnL = (position.entry_price - currentPrice) * position.quantity * (position.leverage || 1);
    }
    
    return grossPnL - entryFee - exitFee - fundingFee;
  }, []);

  // Fast profit target checking - STRICT TARGET (no buffer), with closing lock
  const checkProfitTargets = useCallback(async () => {
    if (!isRunningRef.current) return;
    const currentSettings = settingsRef.current;
    if (!currentSettings?.is_bot_running) return;
    
    const now = Date.now();
    if (now - lastProfitCheckRef.current < 500) return;
    lastProfitCheckRef.current = now;
    
    for (const position of positionsRef.current) {
      // Skip if already closing this position
      if (closingPositionIdsRef.current.has(position.id)) {
        continue;
      }

      const profitTarget = position.trade_type === 'futures'
        ? currentSettings.futures_profit_target
        : currentSettings.spot_profit_target;

      // Use current price from WebSocket for more accurate calculation
      const currentPrice = prices[position.symbol] || position.current_price || position.entry_price;
      
      // Calculate NET PnL including ALL fees (entry, exit, funding)
      const netPnL = calculateNetPnL(position, currentPrice);

      // STRICT: Close exactly when netPnL >= profitTarget (no buffer)
      if (netPnL >= profitTarget) {
        console.log(`🎯 Position ${position.symbol} hit NET profit target $${netPnL.toFixed(2)} >= $${profitTarget.toFixed(2)}! Closing NOW...`);
        
        // Add to closing set to prevent duplicate close attempts
        closingPositionIdsRef.current.add(position.id);
        setEngineStatus('trading');
        
        try {
          // Pass the exit price and require profit validation
          const response = await invokeWithRetry(() => 
            supabase.functions.invoke('close-position', { 
              body: { 
                positionId: position.id,
                exitPrice: currentPrice,
                requireProfit: true, // CRITICAL: Only close if profitable
              } 
            })
          );
          
          // Remove from local state immediately
          setPositions(prev => prev.filter(p => p.id !== position.id));
          
          // Check if already closed (treat as success)
          const alreadyClosed = response?.alreadyClosed;
          
          appendExecutionLog({
            type: 'TRADE_SUCCESS',
            message: alreadyClosed 
              ? `Position was already closed` 
              : `Position closed at NET profit +$${netPnL.toFixed(2)} (target: +$${profitTarget})`,
            symbol: position.symbol,
          });
          console.log(`✅ Position ${position.symbol} closed successfully with NET profit +$${netPnL.toFixed(2)}`);
          
          // CRITICAL: Immediately trigger trading loop to open new trades
          setTimeout(() => {
            if (isRunningRef.current) {
              console.log('🔄 Position closed - immediately checking for new trade opportunities...');
              runTradingLoopRef.current();
            }
          }, 100);
          
        } catch (err) {
          console.error(`Failed to close position ${position.id}:`, err);
          appendExecutionLog({
            type: 'TRADE_FAILED',
            message: `Failed to close position: ${err instanceof Error ? err.message : 'Unknown error'}`,
            symbol: position.symbol,
          });
        } finally {
          // Always remove from closing set
          closingPositionIdsRef.current.delete(position.id);
        }
      }
    }
  }, [appendExecutionLog, calculateNetPnL, prices]);

  // Core trade execution logic (extracted for reuse)
  const executeTradeFromSignal = useCallback(async (signal: TradingSignal, isTestTrade = false): Promise<boolean> => {
    const currentSettings = settingsRef.current;
    const currentExchanges = exchangesRef.current;
    const currentPositions = positionsRef.current;
    
    if (!currentSettings) {
      appendExecutionLog({ type: 'BLOCKED', message: 'No settings loaded' });
      return false;
    }

    // Check max positions (skip for test trade if desired, but we respect it by default)
    if (currentPositions.length >= (currentSettings.max_open_positions || 10)) {
      appendExecutionLog({ 
        type: 'BLOCKED', 
        message: `Max positions reached (${currentPositions.length}/${currentSettings.max_open_positions})`,
        symbol: signal.symbol,
      });
      return false;
    }

    // Find exchange
    let targetExchange = currentExchanges.find(e => e.exchange === signal.exchange && e.is_connected);
    if (!targetExchange) {
      targetExchange = currentExchanges.find(e => e.is_connected);
    }
    if (!targetExchange) {
      appendExecutionLog({ type: 'BLOCKED', message: 'No connected exchange available', symbol: signal.symbol });
      return false;
    }

    // Calculate order size
    const orderSize = Math.min(
      Math.max(currentSettings.min_order_size, 333),
      currentSettings.max_order_size
    );

    const profitTarget = signal.tradeType === 'futures' 
      ? currentSettings.futures_profit_target 
      : currentSettings.spot_profit_target;

    appendExecutionLog({
      type: 'TRADE_REQUESTED',
      message: `${isTestTrade ? '[TEST] ' : ''}Executing ${signal.direction.toUpperCase()} ${signal.symbol} @ $${signal.entryPrice.toFixed(2)} | Size: $${orderSize} | Target: +$${profitTarget}`,
      symbol: signal.symbol,
      details: `Exchange: ${targetExchange.exchange}, Score: ${signal.score}, Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
    });

    console.log(`🚀 ${isTestTrade ? '[TEST] ' : ''}EXECUTING TRADE: ${signal.direction.toUpperCase()} ${signal.symbol} @ $${signal.entryPrice} | Size: $${orderSize} | Target: +$${profitTarget}`);

    try {
      const execStart = Date.now();
      const response = await invokeWithRetry(() => 
        supabase.functions.invoke('execute-trade', {
          body: {
            exchangeId: targetExchange!.id,
            symbol: signal.symbol,
            direction: signal.direction,
            tradeType: signal.tradeType,
            orderSizeUsd: orderSize,
            entryPrice: signal.entryPrice,
            profitTarget,
            leverage: signal.tradeType === 'futures' ? 10 : 1,
            isPaperTrade: currentSettings.is_paper_trading,
            aiScore: signal.score,
            aiReasoning: signal.reasoning,
          },
        })
      );
      
      const execTime = Date.now() - execStart;
      console.log(`✅ Trade executed in ${execTime}ms`);

      appendExecutionLog({
        type: 'TRADE_SUCCESS',
        message: `Trade executed successfully in ${execTime}ms`,
        symbol: signal.symbol,
        details: response ? JSON.stringify(response).slice(0, 200) : undefined,
      });

      setEngineMetrics(prev => ({
        ...prev,
        tradesPerHour: prev.tradesPerHour + 1,
        executionTime: execTime,
      }));

      // Record in cooldown map (per-signal tracking)
      const signalKey = `${signal.exchange}:${signal.symbol}:${signal.direction}`;
      lastExecutedMapRef.current[signalKey] = Date.now();

      return true;
    } catch (err) {
      console.error('❌ Trade execution failed:', err);
      appendExecutionLog({
        type: 'TRADE_FAILED',
        message: `Trade execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        symbol: signal.symbol,
      });
      return false;
    }
  }, [appendExecutionLog]);

  // Trading loop (uses refs for stability) - NOW TRADES MULTIPLE PAIRS
  const runTradingLoop = useCallback(async () => {
    if (!isRunningRef.current) return;
    const currentSettings = settingsRef.current;
    if (!currentSettings?.is_bot_running) return;
    
    lastTradingLoopTickRef.current = Date.now();
    const cycleStart = Date.now();
    
    try {
      const currentPositions = positionsRef.current;
      const currentSignals = signalsRef.current;
      const currentExchanges = exchangesRef.current;
      const maxPositions = currentSettings.max_open_positions || 10;
      const availableSlots = maxPositions - currentPositions.length;

      // Check if we're at max positions
      if (availableSlots <= 0) {
        appendExecutionLog({
          type: 'LOOP_TICK',
          message: `Monitoring ${currentPositions.length} positions (max: ${maxPositions})`,
        });
        setEngineStatus('monitoring');
        return;
      }

      // Check exchange connection
      const hasConnectedExchange = currentExchanges.some(e => e.is_connected);
      if (!hasConnectedExchange) {
        appendExecutionLog({
          type: 'BLOCKED',
          message: 'No exchanges connected',
        });
        setEngineStatus('monitoring');
        return;
      }

      // Get thresholds
      const thresholdKey = (currentSettings.ai_aggressiveness || 'balanced') as keyof typeof THRESHOLDS;
      const { confidence: confidenceThreshold, score: scoreThreshold } = THRESHOLDS[thresholdKey] || THRESHOLDS.balanced;

      // Build set of symbols already in position (to avoid duplicates)
      const positionSymbols = new Set(currentPositions.map(p => p.symbol));

      // Execute MULTIPLE signals per cycle (up to available slots and MAX_NEW_TRADES_PER_CYCLE)
      const maxTradesToExecute = Math.min(availableSlots, MAX_NEW_TRADES_PER_CYCLE);
      let tradesExecutedThisCycle = 0;

      if (currentSignals.length > 0) {
        for (const signal of currentSignals) {
          if (tradesExecutedThisCycle >= maxTradesToExecute) break;

          // Skip if we already have a position on this symbol
          if (positionSymbols.has(signal.symbol)) {
            appendExecutionLog({
              type: 'BLOCKED',
              message: `Already have open position`,
              symbol: signal.symbol,
            });
            continue;
          }

          // Check thresholds
          if (signal.confidence < confidenceThreshold) {
            appendExecutionLog({
              type: 'BLOCKED',
              message: `Confidence ${(signal.confidence * 100).toFixed(0)}% < ${(confidenceThreshold * 100).toFixed(0)}%`,
              symbol: signal.symbol,
            });
            continue;
          }

          if (signal.score < scoreThreshold) {
            appendExecutionLog({
              type: 'BLOCKED',
              message: `Score ${signal.score} < ${scoreThreshold}`,
              symbol: signal.symbol,
            });
            continue;
          }

          // Check per-signal cooldown (FASTER for high-confidence signals)
          const signalKey = `${signal.exchange}:${signal.symbol}:${signal.direction}`;
          const lastExecTime = lastExecutedMapRef.current[signalKey];
          // High confidence (>0.7) = 8s cooldown, otherwise 12s cooldown
          const cooldownMs = signal.confidence >= 0.7 ? 8000 : 12000;
          if (lastExecTime && Date.now() - lastExecTime < cooldownMs) {
            appendExecutionLog({
              type: 'BLOCKED',
              message: `Cooldown: executed ${Math.floor((Date.now() - lastExecTime) / 1000)}s ago (need ${cooldownMs/1000}s)`,
              symbol: signal.symbol,
            });
            continue;
          }

          // Execute the trade
          setEngineStatus('trading');
          const success = await executeTradeFromSignal(signal);
          if (success) {
            tradesExecutedThisCycle++;
            positionSymbols.add(signal.symbol); // Prevent duplicate in same cycle
            lastExecutedMapRef.current[signalKey] = Date.now();
          }
        }

        if (tradesExecutedThisCycle > 0) {
          appendExecutionLog({
            type: 'LOOP_TICK',
            message: `Executed ${tradesExecutedThisCycle} trade(s) this cycle`,
          });
        } else {
          appendExecutionLog({
            type: 'LOOP_TICK',
            message: `Evaluated ${currentSignals.length} signals, none passed filters`,
          });
        }
      } else {
        appendExecutionLog({
          type: 'LOOP_TICK',
          message: 'Waiting for AI signals...',
        });
      }

      const cycleTime = Date.now() - cycleStart;
      setEngineMetrics(prev => ({ ...prev, cycleTime }));
      setEngineStatus('monitoring');
    } catch (error) {
      console.error('Trading loop error:', error);
      appendExecutionLog({
        type: 'TRADE_FAILED',
        message: `Trading loop error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      setEngineStatus('error');
    }
  }, [appendExecutionLog, executeTradeFromSignal]);

  // Watchdog to ensure trading loop keeps running
  const runWatchdog = useCallback(() => {
    if (!isRunningRef.current) return;
    const currentSettings = settingsRef.current;
    if (!currentSettings?.is_bot_running) return;

    const now = Date.now();
    const timeSinceLastTick = now - lastTradingLoopTickRef.current;

    // If no tick in 10+ seconds and bot should be running, restart loop
    if (timeSinceLastTick > 10000 && tradingLoopRef.current === null) {
      console.log('⚠️ WATCHDOG: Trading loop stopped, restarting...');
      appendExecutionLog({
        type: 'WATCHDOG',
        message: `Loop was stopped for ${Math.floor(timeSinceLastTick / 1000)}s - restarting`,
      });
      
      runTradingLoop();
      tradingLoopRef.current = setInterval(runTradingLoop, TRADING_LOOP_INTERVAL);
      
      if (!profitCheckRef.current) {
        profitCheckRef.current = setInterval(checkProfitTargets, PROFIT_CHECK_INTERVAL);
      }
    }
  }, [runTradingLoop, checkProfitTargets, appendExecutionLog]);

  // Test trade top signal (bypasses thresholds)
  const testTradeTopSignal = useCallback(async () => {
    const currentSignals = signalsRef.current;
    if (currentSignals.length === 0) {
      appendExecutionLog({ type: 'BLOCKED', message: 'No signals to test trade' });
      return;
    }

    const topSignal = currentSignals[0];
    appendExecutionLog({
      type: 'TRADE_REQUESTED',
      message: `[MANUAL TEST] Force executing top signal`,
      symbol: topSignal.symbol,
    });

    await executeTradeFromSignal(topSignal, true);
  }, [executeTradeFromSignal, appendExecutionLog]);

  // Start bot
  const startBot = useCallback(async () => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: true })
        .eq('id', currentSettings.id);
      
      setIsEngineRunning(true);
      isRunningRef.current = true;
      setSettings(prev => prev ? { ...prev, is_bot_running: true } : null);
      setEngineStatus('monitoring');
      
      appendExecutionLog({
        type: 'LOOP_TICK',
        message: 'Trading bot STARTED - Loop: 3s, Profit check: 1s, AI scan: 5s',
      });

      // Clear any existing intervals first
      if (tradingLoopRef.current) clearInterval(tradingLoopRef.current);
      if (profitCheckRef.current) clearInterval(profitCheckRef.current);
      
      // Start fast trading loop
      lastTradingLoopTickRef.current = Date.now();
      runTradingLoop();
      tradingLoopRef.current = setInterval(runTradingLoop, TRADING_LOOP_INTERVAL);
      profitCheckRef.current = setInterval(checkProfitTargets, PROFIT_CHECK_INTERVAL);
      
      console.log('🤖 Trading bot started - Loop: 3s, Profit check: 1s, AI scan: 5s');
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  }, [runTradingLoop, checkProfitTargets, appendExecutionLog]);

  // Stop bot
  const stopBot = useCallback(async () => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: false })
        .eq('id', currentSettings.id);
      
      setIsEngineRunning(false);
      isRunningRef.current = false;
      setSettings(prev => prev ? { ...prev, is_bot_running: false } : null);
      setEngineStatus('idle');
      
      if (tradingLoopRef.current) {
        clearInterval(tradingLoopRef.current);
        tradingLoopRef.current = null;
      }
      if (profitCheckRef.current) {
        clearInterval(profitCheckRef.current);
        profitCheckRef.current = null;
      }

      appendExecutionLog({
        type: 'LOOP_TICK',
        message: 'Trading bot STOPPED',
      });
      
      console.log('🛑 Trading bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  }, [appendExecutionLog]);

  // Analyze pairs
  const forceAnalyze = useCallback(async (): Promise<TradingSignal[]> => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) return [];
    
    setEngineStatus('analyzing');
    const startTime = Date.now();
    
    try {
      const connectedExchanges = exchangesRef.current.filter(e => e.is_connected).map(e => e.exchange);
      if (connectedExchanges.length === 0) return [];

      const data = await invokeWithRetry(() => 
        supabase.functions.invoke('analyze-pairs', {
          body: {
            exchanges: connectedExchanges,
            mode: exchangesRef.current.some(e => e.futures_enabled) ? 'both' : 'spot',
            aggressiveness: currentSettings.ai_aggressiveness || 'balanced',
          },
        })
      );

      const newSignals = data?.signals || [];
      setSignals(newSignals);
      setEngineMetrics(prev => ({
        ...prev,
        analysisTime: Date.now() - startTime,
        lastScanTime: new Date(),
      }));
      setEngineStatus(isRunningRef.current ? 'monitoring' : 'idle');
      
      return newSignals;
    } catch (error) {
      console.error('Error analyzing pairs:', error);
      setEngineStatus('error');
      return [];
    }
  }, []);

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
        positionsRef.current.map(p => 
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
  }, []);

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
      
      const { data: exchangesData } = await supabase.from('exchanges').select('*');
      if (exchangesData) setExchanges(exchangesData as Exchange[]);
    } catch (error) {
      console.error('Error syncing balances:', error);
      throw error;
    }
  }, []);

  // Initialize - fetch data first
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Connect WebSockets after exchanges are loaded
  useEffect(() => {
    if (!loading && !initialConnectionMade.current) {
      initialConnectionMade.current = true;
      connectToExchange('binance');
      
      setTimeout(() => {
        if (!connectionStatesRef.current['binance']?.connected) {
          startRestFallback();
        }
      }, 5000);
    }
  }, [loading, connectToExchange, startRestFallback]);

  // Connect to additional exchanges
  useEffect(() => {
    if (exchanges.length > 0) {
      exchanges.filter(e => e.is_connected).forEach(exchange => {
        const exchangeName = exchange.exchange as ExchangeName;
        if (!wsRefs.current[exchangeName] && WS_ENDPOINTS[exchangeName]) {
          connectToExchange(exchangeName);
        }
      });
      
      if (!hasAutoSynced.current && exchanges.some(e => e.is_connected && e.api_key_encrypted)) {
        hasAutoSynced.current = true;
        console.log('Auto-syncing balances on startup...');
        syncBalances().catch(err => console.error('Auto-sync failed:', err));
      }
    }
  }, [exchanges, connectToExchange, syncBalances]);

  // Auto-resume trading loop if bot was already running
  useEffect(() => {
    if (!loading && settings?.is_bot_running && !tradingLoopRef.current) {
      console.log('🔄 Auto-resuming trading loop (bot was already running)');
      setIsEngineRunning(true);
      isRunningRef.current = true;
      setEngineStatus('monitoring');
      
      appendExecutionLog({
        type: 'WATCHDOG',
        message: 'Auto-resumed trading loop after page load',
      });
      
      lastTradingLoopTickRef.current = Date.now();
      runTradingLoop();
      tradingLoopRef.current = setInterval(runTradingLoop, TRADING_LOOP_INTERVAL);
      profitCheckRef.current = setInterval(checkProfitTargets, PROFIT_CHECK_INTERVAL);
    }
  }, [loading, settings?.is_bot_running, runTradingLoop, checkProfitTargets, appendExecutionLog]);

  // Start background scanning (stable - runs once)
  useEffect(() => {
    runBackgroundScan();
    backgroundScanRef.current = setInterval(runBackgroundScan, BACKGROUND_SCAN_INTERVAL);
    
    return () => {
      if (backgroundScanRef.current) {
        clearInterval(backgroundScanRef.current);
        backgroundScanRef.current = null;
      }
    };
  }, [runBackgroundScan]);

  // Auto balance sync loop - keeps balances updated continuously
  useEffect(() => {
    const hasConnectedExchangeWithKeys = exchanges.some(e => e.is_connected && e.api_key_encrypted);
    
    if (!hasConnectedExchangeWithKeys) {
      // No exchanges with keys, clear interval if exists
      if (balanceSyncRef.current) {
        clearInterval(balanceSyncRef.current);
        balanceSyncRef.current = null;
      }
      return;
    }
    
    // Auto-sync function with guard against overlapping calls
    const autoSyncBalances = async () => {
      if (isSyncingBalancesRef.current) return;
      
      try {
        isSyncingBalancesRef.current = true;
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
        console.error('Auto balance sync error:', error);
      } finally {
        isSyncingBalancesRef.current = false;
      }
    };
    
    // Start the interval
    if (!balanceSyncRef.current) {
      console.log('📊 Starting auto balance sync (every 30s)');
      balanceSyncRef.current = setInterval(autoSyncBalances, BALANCE_SYNC_INTERVAL);
    }
    
    return () => {
      if (balanceSyncRef.current) {
        clearInterval(balanceSyncRef.current);
        balanceSyncRef.current = null;
      }
    };
  }, [exchanges]);

  // Watchdog interval (stable)
  useEffect(() => {
    watchdogRef.current = setInterval(runWatchdog, WATCHDOG_INTERVAL);
    
    return () => {
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [runWatchdog]);

  // Set up real-time subscriptions (stable - no runHealthCheck in deps)
  useEffect(() => {
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

    const balancesChannel = supabase
      .channel('balances-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, () => {
        supabase.from('balances').select('*').then(({ data }) => {
          if (data) {
            setBalances(data.map(b => ({
              ...b,
              available: Number(b.available),
              locked: Number(b.locked),
              total: Number(b.total),
            })) as Balance[]);
          }
        });
      })
      .subscribe();

    healthCheckRef.current = setInterval(runHealthCheck, 10000);

    return () => {
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(balancesChannel);
      Object.values(wsRefs.current).forEach(ws => ws.close());
      Object.values(reconnectTimeouts.current).forEach(t => clearTimeout(t));
      
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
      if (tradingLoopRef.current) {
        clearInterval(tradingLoopRef.current);
        tradingLoopRef.current = null;
      }
      if (restFallbackRef.current) {
        clearInterval(restFallbackRef.current);
        restFallbackRef.current = null;
      }
      if (backgroundScanRef.current) {
        clearInterval(backgroundScanRef.current);
        backgroundScanRef.current = null;
      }
      if (profitCheckRef.current) {
        clearInterval(profitCheckRef.current);
        profitCheckRef.current = null;
      }
      if (balanceSyncRef.current) {
        clearInterval(balanceSyncRef.current);
        balanceSyncRef.current = null;
      }
    };
  }, [runHealthCheck]);

  // Keep runTradingLoopRef in sync
  useEffect(() => {
    runTradingLoopRef.current = runTradingLoop;
  }, [runTradingLoop]);

  // Update position prices from WebSocket/REST data - NOW WITH FEE-INCLUSIVE PNL
  useEffect(() => {
    if (positions.length === 0) return;
    
    let hasUpdates = false;
    const updatedPositions = positions.map(position => {
      const currentPrice = prices[position.symbol];
      if (!currentPrice || currentPrice === position.current_price) return position;
      
      hasUpdates = true;
      
      // Calculate NET PnL including ALL fees (same as checkProfitTargets)
      const feeRate = position.trade_type === 'spot' ? 0.001 : 0.0005;
      const entryFee = position.order_size_usd * feeRate;
      const exitFee = position.order_size_usd * feeRate;
      const fundingFee = position.trade_type === 'futures' ? position.order_size_usd * 0.0001 : 0;
      
      let grossPnL: number;
      if (position.direction === 'long') {
        grossPnL = (currentPrice - position.entry_price) * position.quantity * (position.leverage || 1);
      } else {
        grossPnL = (position.entry_price - currentPrice) * position.quantity * (position.leverage || 1);
      }
      
      const netPnL = grossPnL - entryFee - exitFee - fundingFee;
      
      return { ...position, current_price: currentPrice, unrealized_pnl: netPnL };
    });
    
    if (hasUpdates) {
      setPositions(updatedPositions);
      if (isRunningRef.current) {
        checkProfitTargets();
      }
    }
  }, [prices, checkProfitTargets]);

  const value: TradingContextType = {
    prices,
    positions,
    exchanges,
    balances,
    settings,
    signals,
    trades,
    marketData,
    executionLogs,
    connectionStates,
    engineStatus,
    engineMetrics,
    isEngineRunning,
    isScanning,
    loading,
    startBot,
    stopBot,
    forceAnalyze,
    closePosition,
    closeAllPositions,
    refreshData: fetchAllData,
    syncBalances,
    testTradeTopSignal,
    clearExecutionLogs,
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

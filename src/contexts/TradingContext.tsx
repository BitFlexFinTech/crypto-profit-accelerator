import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Position, Exchange, Balance, BotSettings, Trade } from '@/types/trading';
import { rateLimiter } from '@/services/RateLimiter';
import { invokeWithRetry } from '@/utils/retryWithBackoff';
import { fetchAllPrices } from '@/services/PriceFetcher';

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
const REST_FALLBACK_INTERVAL = 2000; // 2 seconds - faster price updates
const BACKGROUND_SCAN_INTERVAL = 5000; // 5 seconds - faster AI analysis
const TRADING_LOOP_INTERVAL = 3000; // 3 seconds - fast trade execution
const PROFIT_CHECK_INTERVAL = 1000; // 1 second - instant profit target checks

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
  
  // Refs
  const wsRefs = useRef<Record<string, WebSocket>>({});
  const reconnectTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const tradingLoopRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const restFallbackRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundScanRef = useRef<NodeJS.Timeout | null>(null);
  const profitCheckRef = useRef<NodeJS.Timeout | null>(null);
  const initialConnectionMade = useRef(false);
  const connectionStatesRef = useRef<Record<string, ConnectionState>>({});
  const hasAutoSynced = useRef(false);
  const isRunningRef = useRef(false);
  const lastProfitCheckRef = useRef<number>(0);

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

  // REST API fallback for fetching prices
  const fetchPricesViaREST = useCallback(async () => {
    try {
      const priceData = await fetchAllPrices(DEFAULT_SYMBOLS);
      
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
        
        // Update connection state to show REST fallback is active
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
  }, []);

  // Start REST fallback polling
  const startRestFallback = useCallback(() => {
    if (restFallbackRef.current) return; // Already running
    
    console.log('Starting REST API fallback for price data...');
    fetchPricesViaREST(); // Fetch immediately
    restFallbackRef.current = setInterval(fetchPricesViaREST, REST_FALLBACK_INTERVAL);
  }, [fetchPricesViaREST]);

  // WebSocket connection with reconnection logic
  const connectToExchange = useCallback((exchangeName: ExchangeName) => {
    if (!WS_ENDPOINTS[exchangeName]) {
      console.log(`No WebSocket endpoint for ${exchangeName}`);
      return;
    }

    // Close existing connection if any
    if (wsRefs.current[exchangeName]) {
      wsRefs.current[exchangeName].close();
    }

    // Set connecting status
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

    const connectWs = () => {
      let ws: WebSocket;
      const symbols = DEFAULT_SYMBOLS;
      
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

        // Subscribe for OKX/Bybit
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
            
            // Update market data with real values
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
          // Ignore parse errors for ping/pong messages
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
        // Start REST fallback on error
        startRestFallback();
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        console.log(`${exchangeName} WebSocket closed`);
        
        // Use ref to get current state to avoid stale closure
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
        
        // Reconnect with exponential backoff
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
          // Start REST fallback when all retries exhausted
          startRestFallback();
        }
      };

      wsRefs.current[exchangeName] = ws;
    };

    connectWs();
  }, [startRestFallback]);

  // Health check for connections
  const runHealthCheck = useCallback(() => {
    const now = Date.now();
    let anyConnected = false;
    
    Object.entries(connectionStates).forEach(([exchange, state]) => {
      if (state.connected) anyConnected = true;
      
      if (state.lastPing && now - state.lastPing.getTime() > 30000 && state.status === 'connected') {
        console.log(`No ping from ${exchange} in 30 seconds, reconnecting...`);
        const ws = wsRefs.current[exchange];
        if (ws) {
          ws.close();
        }
      }
    });
    
    // If no WebSocket is connected and REST fallback isn't running, start it
    if (!anyConnected && !restFallbackRef.current) {
      startRestFallback();
    }
  }, [connectionStates, startRestFallback]);

  // Background AI scanning (runs even when bot is stopped)
  const runBackgroundScan = useCallback(async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    const prevStatus = engineStatus;
    setEngineStatus('scanning');
    
    try {
      const connectedExchanges = exchanges.filter(e => e.is_connected).map(e => e.exchange);
      if (connectedExchanges.length === 0) {
        // No exchanges connected, but still update scan time
        setEngineMetrics(prev => ({ ...prev, lastScanTime: new Date() }));
        return;
      }

      const startTime = Date.now();
      
      const data = await invokeWithRetry(() => 
        supabase.functions.invoke('analyze-pairs', {
          body: {
            exchanges: connectedExchanges,
            mode: exchanges.some(e => e.futures_enabled) ? 'both' : 'spot',
            aggressiveness: settings?.ai_aggressiveness || 'balanced',
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
      
      console.log(`Background scan complete: ${newSignals.length} signals found`);
    } catch (error) {
      console.error('Background scan error:', error);
    } finally {
      setIsScanning(false);
      setEngineStatus(isEngineRunning ? 'monitoring' : 'idle');
    }
  }, [exchanges, settings, isScanning, isEngineRunning, engineStatus]);

  // Fast profit target checking - runs every second
  const checkProfitTargets = useCallback(async () => {
    if (!isRunningRef.current || !settings?.is_bot_running) return;
    
    // Prevent overlapping checks
    const now = Date.now();
    if (now - lastProfitCheckRef.current < 500) return;
    lastProfitCheckRef.current = now;
    
    for (const position of positions) {
      const profitTarget = position.trade_type === 'futures'
        ? settings.futures_profit_target
        : settings.spot_profit_target;

      if (position.unrealized_pnl >= profitTarget) {
        console.log(`🎯 Position ${position.symbol} hit $${profitTarget} profit target! Closing NOW...`);
        setEngineStatus('trading');
        
        try {
          await invokeWithRetry(() => 
            supabase.functions.invoke('close-position', { body: { positionId: position.id } })
          );
          setPositions(prev => prev.filter(p => p.id !== position.id));
          console.log(`✅ Position ${position.symbol} closed successfully`);
        } catch (err) {
          console.error(`Failed to close position ${position.id}:`, err);
        }
      }
    }
  }, [settings, positions]);

  // Trading loop - runs when bot is started (fast execution)
  const runTradingLoop = useCallback(async () => {
    if (!isRunningRef.current || !settings?.is_bot_running) return;
    
    const cycleStart = Date.now();
    
    try {
      // Check if we're at max positions
      if (positions.length >= (settings.max_open_positions || 10)) {
        setEngineStatus('monitoring');
        return;
      }

      // Get top signal and execute if conditions are met
      if (signals.length > 0) {
        const topSignal = signals[0];
        
        // Determine confidence threshold based on aggressiveness (lowered for faster trading)
        const confidenceThreshold = settings.ai_aggressiveness === 'aggressive' ? 0.4 :
                                   settings.ai_aggressiveness === 'conservative' ? 0.7 : 0.5;
        
        // Lowered score threshold from 60 to 45 for more trading opportunities
        const scoreThreshold = settings.ai_aggressiveness === 'aggressive' ? 40 :
                              settings.ai_aggressiveness === 'conservative' ? 60 : 45;
        
        console.log(`📊 Top signal: ${topSignal.symbol} | Score: ${topSignal.score} (need ${scoreThreshold}) | Confidence: ${(topSignal.confidence * 100).toFixed(1)}% (need ${(confidenceThreshold * 100).toFixed(1)}%)`);
        
        if (topSignal.confidence >= confidenceThreshold && topSignal.score >= scoreThreshold) {
          setEngineStatus('trading');
          
          // Find exchange
          const exchange = exchanges.find(e => e.exchange === topSignal.exchange && e.is_connected);
          if (!exchange) {
            console.log(`⚠️ Exchange ${topSignal.exchange} not connected, trying others...`);
            // Try to find any connected exchange
            const anyExchange = exchanges.find(e => e.is_connected);
            if (!anyExchange) {
              setEngineStatus('monitoring');
              return;
            }
          }
          
          const targetExchange = exchange || exchanges.find(e => e.is_connected);
          if (!targetExchange) return;

          // Calculate order size
          const orderSize = Math.min(
            Math.max(settings.min_order_size, 333),
            settings.max_order_size
          );

          // Determine profit target
          const profitTarget = topSignal.tradeType === 'futures' 
            ? settings.futures_profit_target 
            : settings.spot_profit_target;

          console.log(`🚀 EXECUTING TRADE: ${topSignal.direction.toUpperCase()} ${topSignal.symbol} @ $${topSignal.entryPrice} | Size: $${orderSize} | Target: +$${profitTarget}`);

          try {
            const execStart = Date.now();
            await invokeWithRetry(() => 
              supabase.functions.invoke('execute-trade', {
                body: {
                  exchangeId: targetExchange.id,
                  symbol: topSignal.symbol,
                  direction: topSignal.direction,
                  tradeType: topSignal.tradeType,
                  orderSizeUsd: orderSize,
                  entryPrice: topSignal.entryPrice,
                  profitTarget,
                  leverage: topSignal.tradeType === 'futures' ? 10 : 1,
                  isPaperTrade: settings.is_paper_trading,
                  aiScore: topSignal.score,
                  aiReasoning: topSignal.reasoning,
                },
              })
            );
            
            const execTime = Date.now() - execStart;
            console.log(`✅ Trade executed in ${execTime}ms`);

            setEngineMetrics(prev => ({
              ...prev,
              tradesPerHour: prev.tradesPerHour + 1,
              executionTime: execTime,
            }));
          } catch (err) {
            console.error('❌ Trade execution failed:', err);
          }
        } else {
          console.log(`⏳ Signal below threshold, waiting for better opportunity...`);
        }
      } else {
        console.log(`🔍 No signals yet, waiting for AI analysis...`);
      }

      const cycleTime = Date.now() - cycleStart;
      setEngineMetrics(prev => ({ ...prev, cycleTime }));
      setEngineStatus('monitoring');
    } catch (error) {
      console.error('Trading loop error:', error);
      setEngineStatus('error');
    }
  }, [settings, positions, signals, exchanges]);

  // Start bot
  const startBot = useCallback(async () => {
    if (!settings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: true })
        .eq('id', settings.id);
      
      setIsEngineRunning(true);
      isRunningRef.current = true;
      setSettings(prev => prev ? { ...prev, is_bot_running: true } : null);
      setEngineStatus('monitoring');
      
      // Start fast trading loop (every 3 seconds)
      runTradingLoop();
      tradingLoopRef.current = setInterval(runTradingLoop, TRADING_LOOP_INTERVAL);
      
      // Start fast profit target checking (every 1 second)
      profitCheckRef.current = setInterval(checkProfitTargets, PROFIT_CHECK_INTERVAL);
      
      console.log('🤖 Trading bot started - Loop: 3s, Profit check: 1s, AI scan: 5s');
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  }, [settings, runTradingLoop, checkProfitTargets]);

  // Stop bot
  const stopBot = useCallback(async () => {
    if (!settings) return;
    
    try {
      await supabase
        .from('bot_settings')
        .update({ is_bot_running: false })
        .eq('id', settings.id);
      
      setIsEngineRunning(false);
      isRunningRef.current = false;
      setSettings(prev => prev ? { ...prev, is_bot_running: false } : null);
      setEngineStatus('idle');
      
      // Stop trading loop and profit checking but keep background scanning
      if (tradingLoopRef.current) {
        clearInterval(tradingLoopRef.current);
        tradingLoopRef.current = null;
      }
      if (profitCheckRef.current) {
        clearInterval(profitCheckRef.current);
        profitCheckRef.current = null;
      }
      console.log('🛑 Trading bot stopped');
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
        lastScanTime: new Date(),
      }));
      setEngineStatus(isEngineRunning ? 'monitoring' : 'idle');
      
      return newSignals;
    } catch (error) {
      console.error('Error analyzing pairs:', error);
      setEngineStatus('error');
      return [];
    }
  }, [settings, exchanges, isEngineRunning]);

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
      
      // Refresh exchanges to get updated last_balance_sync
      const { data: exchangesData } = await supabase.from('exchanges').select('*');
      if (exchangesData) {
        setExchanges(exchangesData as Exchange[]);
      }
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
      // Connect to Binance immediately for public price data
      connectToExchange('binance');
      
      // Also start REST fallback immediately as a backup
      setTimeout(() => {
        // If WebSocket hasn't connected in 5 seconds, REST fallback will already be running
        if (!connectionStates['binance']?.connected) {
          startRestFallback();
        }
      }, 5000);
    }
  }, [loading, connectToExchange, startRestFallback, connectionStates]);

  // Connect to additional exchanges when they're configured
  useEffect(() => {
    if (exchanges.length > 0) {
      exchanges.filter(e => e.is_connected).forEach(exchange => {
        const exchangeName = exchange.exchange as ExchangeName;
        if (!wsRefs.current[exchangeName] && WS_ENDPOINTS[exchangeName]) {
          connectToExchange(exchangeName);
        }
      });
      
      // Auto-sync balances once when exchanges are first loaded
      if (!hasAutoSynced.current && exchanges.some(e => e.is_connected && e.api_key_encrypted)) {
        hasAutoSynced.current = true;
        console.log('Auto-syncing balances on startup...');
        syncBalances().catch(err => console.error('Auto-sync failed:', err));
      }
    }
  }, [exchanges, connectToExchange, syncBalances]);

  // Start background scanning
  useEffect(() => {
    // Start background scan immediately
    runBackgroundScan();
    
    // Run every 30 seconds
    backgroundScanRef.current = setInterval(runBackgroundScan, BACKGROUND_SCAN_INTERVAL);
    
    return () => {
      if (backgroundScanRef.current) {
        clearInterval(backgroundScanRef.current);
      }
    };
  }, [runBackgroundScan]);

  // Set up real-time subscriptions
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

    // Health check interval
    healthCheckRef.current = setInterval(runHealthCheck, 10000);

    return () => {
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(balancesChannel);
      Object.values(wsRefs.current).forEach(ws => ws.close());
      Object.values(reconnectTimeouts.current).forEach(t => clearTimeout(t));
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (tradingLoopRef.current) clearInterval(tradingLoopRef.current);
      if (restFallbackRef.current) clearInterval(restFallbackRef.current);
      if (backgroundScanRef.current) clearInterval(backgroundScanRef.current);
      if (profitCheckRef.current) clearInterval(profitCheckRef.current);
    };
  }, [runHealthCheck]);

  // Update position prices from WebSocket/REST data - optimized for speed
  useEffect(() => {
    if (positions.length === 0) return;
    
    let hasUpdates = false;
    const updatedPositions = positions.map(position => {
      const currentPrice = prices[position.symbol];
      if (!currentPrice || currentPrice === position.current_price) return position;
      
      hasUpdates = true;
      let pnl: number;
      if (position.direction === 'long') {
        pnl = (currentPrice - position.entry_price) * position.quantity * (position.leverage || 1);
      } else {
        pnl = (position.entry_price - currentPrice) * position.quantity * (position.leverage || 1);
      }
      
      return { ...position, current_price: currentPrice, unrealized_pnl: pnl };
    });
    
    if (hasUpdates) {
      setPositions(updatedPositions);
      // Trigger immediate profit check when prices update
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

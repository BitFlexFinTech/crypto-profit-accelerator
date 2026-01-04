import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBotSettings } from './useBotSettings';
import { useExchanges } from './useExchanges';
import { usePositions } from './usePositions';
import { useToast } from './use-toast';

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

interface EngineState {
  isRunning: boolean;
  lastAnalysis: Date | null;
  currentSignals: TradingSignal[];
  tradesExecuted: number;
  profitToday: number;
  lossToday: number;
  status: 'idle' | 'analyzing' | 'trading' | 'monitoring' | 'error';
  lastError: string | null;
}

export function useTradingEngine() {
  const { toast } = useToast();
  const { settings } = useBotSettings();
  const { exchanges, getConnectedExchangeNames } = useExchanges();
  const { positions, closePosition } = usePositions();
  
  const [engineState, setEngineState] = useState<EngineState>({
    isRunning: false,
    lastAnalysis: null,
    currentSignals: [],
    tradesExecuted: 0,
    profitToday: 0,
    lossToday: 0,
    status: 'idle',
    lastError: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  const analyzePairs = useCallback(async () => {
    if (!settings) return [];

    setEngineState(prev => ({ ...prev, status: 'analyzing' }));

    try {
      const connectedExchanges = getConnectedExchangeNames();
      if (connectedExchanges.length === 0) {
        throw new Error('No exchanges connected');
      }

      const { data, error } = await supabase.functions.invoke('analyze-pairs', {
        body: {
          exchanges: connectedExchanges,
          mode: exchanges.some(e => e.futures_enabled) ? 'both' : 'spot',
          aggressiveness: settings.ai_aggressiveness || 'balanced',
        },
      });

      if (error) throw error;

      const signals = data?.signals || [];
      setEngineState(prev => ({
        ...prev,
        currentSignals: signals,
        lastAnalysis: new Date(),
        status: 'monitoring',
      }));

      return signals;
    } catch (error) {
      console.error('Error analyzing pairs:', error);
      setEngineState(prev => ({
        ...prev,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Analysis failed',
      }));
      return [];
    }
  }, [settings, exchanges, getConnectedExchangeNames]);

  const executeTrade = useCallback(async (signal: TradingSignal) => {
    if (!settings) return;

    setEngineState(prev => ({ ...prev, status: 'trading' }));

    try {
      // Find the exchange ID
      const exchange = exchanges.find(e => e.exchange === signal.exchange && e.is_connected);
      if (!exchange) {
        throw new Error(`Exchange ${signal.exchange} not found`);
      }

      // Calculate order size within limits
      const orderSize = Math.min(
        Math.max(settings.min_order_size, 333),
        settings.max_order_size
      );

      // Determine profit target based on trade type
      const profitTarget = signal.tradeType === 'futures' 
        ? settings.futures_profit_target 
        : settings.spot_profit_target;

      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          exchangeId: exchange.id,
          symbol: signal.symbol,
          direction: signal.direction,
          tradeType: signal.tradeType,
          orderSizeUsd: orderSize,
          entryPrice: signal.entryPrice,
          profitTarget,
          leverage: signal.tradeType === 'futures' ? 10 : 1,
          isPaperTrade: settings.is_paper_trading,
          aiScore: signal.score,
          aiReasoning: signal.reasoning,
        },
      });

      if (error) throw error;

      setEngineState(prev => ({
        ...prev,
        tradesExecuted: prev.tradesExecuted + 1,
        status: 'monitoring',
      }));

      toast({
        title: `📈 Trade Opened`,
        description: `${signal.direction.toUpperCase()} ${signal.symbol} @ $${signal.entryPrice.toFixed(2)}`,
      });

      return data;
    } catch (error) {
      console.error('Error executing trade:', error);
      setEngineState(prev => ({
        ...prev,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Trade execution failed',
      }));
      throw error;
    }
  }, [settings, exchanges, toast]);

  const checkPositionsForProfit = useCallback(async () => {
    if (!settings || positions.length === 0) return;

    for (const position of positions) {
      const profitTarget = position.trade_type === 'futures'
        ? settings.futures_profit_target
        : settings.spot_profit_target;

      if (position.unrealized_pnl >= profitTarget) {
        console.log(`Position ${position.symbol} hit profit target, closing...`);
        await closePosition(position.id);
        
        setEngineState(prev => ({
          ...prev,
          profitToday: prev.profitToday + position.unrealized_pnl,
        }));
      }
    }
  }, [settings, positions, closePosition]);

  const runTradingLoop = useCallback(async () => {
    if (!isRunningRef.current || !settings?.is_bot_running) return;

    try {
      // Check if we've hit daily loss limit
      if (engineState.lossToday >= settings.daily_loss_limit) {
        console.log('Daily loss limit reached, pausing trading');
        setEngineState(prev => ({ ...prev, status: 'idle', lastError: 'Daily loss limit reached' }));
        return;
      }

      // Check if we're at max positions
      if (positions.length >= settings.max_open_positions) {
        console.log('Max positions reached, monitoring only');
        await checkPositionsForProfit();
        return;
      }

      // Analyze pairs
      const signals = await analyzePairs();

      // Check positions for profit targets
      await checkPositionsForProfit();

      // Execute top signal if conditions are met
      if (signals.length > 0 && positions.length < settings.max_open_positions) {
        const topSignal = signals[0];
        
        // Only trade if confidence is high enough
        const confidenceThreshold = settings.ai_aggressiveness === 'aggressive' ? 0.5 :
                                   settings.ai_aggressiveness === 'conservative' ? 0.8 : 0.65;
        
        if (topSignal.confidence >= confidenceThreshold && topSignal.score >= 60) {
          await executeTrade(topSignal);
        }
      }

    } catch (error) {
      console.error('Trading loop error:', error);
      setEngineState(prev => ({
        ...prev,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [settings, positions, engineState.lossToday, analyzePairs, checkPositionsForProfit, executeTrade]);

  // Start/stop engine based on settings
  useEffect(() => {
    if (settings?.is_bot_running && !isRunningRef.current) {
      console.log('Starting trading engine...');
      isRunningRef.current = true;
      setEngineState(prev => ({ ...prev, isRunning: true, status: 'monitoring' }));
      
      // Run immediately
      runTradingLoop();
      
      // Then run every 30 seconds
      intervalRef.current = setInterval(runTradingLoop, 30000);
    } else if (!settings?.is_bot_running && isRunningRef.current) {
      console.log('Stopping trading engine...');
      isRunningRef.current = false;
      setEngineState(prev => ({ ...prev, isRunning: false, status: 'idle' }));
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [settings?.is_bot_running, runTradingLoop]);

  const forceAnalyze = useCallback(async () => {
    const signals = await analyzePairs();
    return signals;
  }, [analyzePairs]);

  return {
    engineState,
    forceAnalyze,
    executeTrade,
  };
}

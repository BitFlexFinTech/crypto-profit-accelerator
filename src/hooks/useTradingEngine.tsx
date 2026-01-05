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

interface LoopResult {
  success: boolean;
  status: string;
  actions: string[];
  signalsGenerated: number;
  tradesExecuted: number;
  positionsClosed: number;
  errors: string[];
  timestamp: string;
}

interface EngineState {
  isRunning: boolean;
  lastAnalysis: Date | null;
  lastLoopResult: LoopResult | null;
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
  const { exchanges } = useExchanges();
  const { positions, refetch: refetchPositions } = usePositions();
  
  const [engineState, setEngineState] = useState<EngineState>({
    isRunning: false,
    lastAnalysis: null,
    lastLoopResult: null,
    currentSignals: [],
    tradesExecuted: 0,
    profitToday: 0,
    lossToday: 0,
    status: 'idle',
    lastError: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  // Call the server-side trading loop
  const runServerLoop = useCallback(async () => {
    if (!isRunningRef.current || !settings?.is_bot_running) return null;

    setEngineState(prev => ({ ...prev, status: 'analyzing' }));

    try {
      console.log('[TradingEngine] Calling server-side trading loop...');
      
      const { data, error } = await supabase.functions.invoke('run-trading-loop', {
        body: {},
      });

      if (error) throw error;

      const result = data as LoopResult;
      
      setEngineState(prev => ({
        ...prev,
        lastAnalysis: new Date(),
        lastLoopResult: result,
        tradesExecuted: prev.tradesExecuted + (result.tradesExecuted || 0),
        status: result.success ? 'monitoring' : 'error',
        lastError: result.errors?.length > 0 ? result.errors.join(', ') : null,
      }));

      // Refetch positions after loop completes
      if (result.tradesExecuted > 0 || result.positionsClosed > 0) {
        refetchPositions();
        
        if (result.tradesExecuted > 0) {
          toast({
            title: '📈 Trade Executed',
            description: `${result.tradesExecuted} new trade(s) opened`,
          });
        }
        
        if (result.positionsClosed > 0) {
          toast({
            title: '✅ Position Closed',
            description: `${result.positionsClosed} position(s) closed at profit target`,
          });
        }
      }

      console.log('[TradingEngine] Loop result:', result);
      return result;
    } catch (error) {
      console.error('[TradingEngine] Server loop error:', error);
      setEngineState(prev => ({
        ...prev,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Server loop failed',
      }));
      return null;
    }
  }, [settings, refetchPositions, toast]);

  // Start/stop engine based on settings
  useEffect(() => {
    if (settings?.is_bot_running && !isRunningRef.current) {
      console.log('[TradingEngine] Starting engine...');
      isRunningRef.current = true;
      setEngineState(prev => ({ ...prev, isRunning: true, status: 'monitoring' }));
      
      // Run immediately
      runServerLoop();
      
      // Then run every 30 seconds
      intervalRef.current = setInterval(runServerLoop, 30000);
    } else if (!settings?.is_bot_running && isRunningRef.current) {
      console.log('[TradingEngine] Stopping engine...');
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
  }, [settings?.is_bot_running, runServerLoop]);

  // Force run the trading loop
  const forceAnalyze = useCallback(async () => {
    console.log('[TradingEngine] Force running trading loop...');
    const result = await runServerLoop();
    return result;
  }, [runServerLoop]);

  // Legacy executeTrade for manual signal execution
  const executeTrade = useCallback(async (signal: TradingSignal) => {
    if (!settings) return;

    setEngineState(prev => ({ ...prev, status: 'trading' }));

    try {
      const exchange = exchanges.find(e => e.exchange === signal.exchange && e.is_connected);
      if (!exchange) {
        throw new Error(`Exchange ${signal.exchange} not found`);
      }

      const orderSize = Math.min(
        Math.max(settings.min_order_size || 10, 333),
        settings.max_order_size || 1000
      );

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
      
      // Check business-level success from response payload
      if (data && data.success === false) {
        const errMsg = data.error || 'Trade execution failed';
        const suggestion = data.suggestion ? ` ${data.suggestion}` : '';
        throw new Error(`${errMsg}${suggestion}`);
      }

      setEngineState(prev => ({
        ...prev,
        tradesExecuted: prev.tradesExecuted + 1,
        status: 'monitoring',
      }));

      toast({
        title: `📈 Trade Opened`,
        description: `${signal.direction.toUpperCase()} ${signal.symbol} @ $${signal.entryPrice.toFixed(2)}`,
      });

      refetchPositions();
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
  }, [settings, exchanges, toast, refetchPositions]);

  return {
    engineState,
    forceAnalyze,
    executeTrade,
  };
}

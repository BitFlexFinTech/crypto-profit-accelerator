import { useState, useEffect, useCallback, useRef } from 'react';
import { usePositions } from './usePositions';

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

interface WebSocketState {
  connected: boolean;
  exchange: string;
  subscribedSymbols: string[];
}

// WebSocket URLs for different exchanges
const WS_ENDPOINTS: Record<string, string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  okx: 'wss://ws.okx.com:8443/ws/v5/public',
  bybit: 'wss://stream.bybit.com/v5/public/spot',
  kucoin: 'wss://ws-api-spot.kucoin.com',
};

export function useWebSocketPrices() {
  const { positions, updatePositionPrice } = usePositions();
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [connectionStates, setConnectionStates] = useState<Record<string, WebSocketState>>({});
  const wsRefs = useRef<Record<string, WebSocket>>({});
  const reconnectTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  // Get unique symbols from positions
  const positionSymbols = Array.from(new Set(positions.map(p => p.symbol)));

  const handlePriceUpdate = useCallback((symbol: string, price: number) => {
    setPrices(prev => ({ ...prev, [symbol]: price }));
    
    // Update positions with new price
    positions
      .filter(p => p.symbol === symbol)
      .forEach(p => {
        updatePositionPrice(p.id, price);
      });
  }, [positions, updatePositionPrice]);

  const connectToBinance = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;

    const streams = symbols
      .map(s => s.replace('/', '').toLowerCase() + '@ticker')
      .join('/');
    
    const ws = new WebSocket(`${WS_ENDPOINTS.binance}/${streams}`);

    ws.onopen = () => {
      console.log('Binance WebSocket connected');
      setConnectionStates(prev => ({
        ...prev,
        binance: { connected: true, exchange: 'binance', subscribedSymbols: symbols },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.s && data.c) {
          const symbol = data.s.replace('USDT', '/USDT');
          handlePriceUpdate(symbol, parseFloat(data.c));
        }
      } catch (e) {
        console.error('Error parsing Binance message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('Binance WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Binance WebSocket closed');
      setConnectionStates(prev => ({
        ...prev,
        binance: { ...prev.binance, connected: false },
      }));
      
      // Reconnect after 5 seconds
      reconnectTimeouts.current.binance = setTimeout(() => {
        connectToBinance(symbols);
      }, 5000);
    };

    wsRefs.current.binance = ws;
  }, [handlePriceUpdate]);

  const connectToOKX = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;

    const ws = new WebSocket(WS_ENDPOINTS.okx);

    ws.onopen = () => {
      console.log('OKX WebSocket connected');
      
      // Subscribe to tickers
      const args = symbols.map(s => ({
        channel: 'tickers',
        instId: s.replace('/', '-'),
      }));
      
      ws.send(JSON.stringify({
        op: 'subscribe',
        args,
      }));

      setConnectionStates(prev => ({
        ...prev,
        okx: { connected: true, exchange: 'okx', subscribedSymbols: symbols },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.data && data.data[0]) {
          const ticker = data.data[0];
          const symbol = ticker.instId.replace('-', '/');
          handlePriceUpdate(symbol, parseFloat(ticker.last));
        }
      } catch (e) {
        console.error('Error parsing OKX message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('OKX WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('OKX WebSocket closed');
      setConnectionStates(prev => ({
        ...prev,
        okx: { ...prev.okx, connected: false },
      }));
      
      reconnectTimeouts.current.okx = setTimeout(() => {
        connectToOKX(symbols);
      }, 5000);
    };

    wsRefs.current.okx = ws;
  }, [handlePriceUpdate]);

  const connectToBybit = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return;

    const ws = new WebSocket(WS_ENDPOINTS.bybit);

    ws.onopen = () => {
      console.log('Bybit WebSocket connected');
      
      const args = symbols.map(s => `tickers.${s.replace('/', '')}`);
      
      ws.send(JSON.stringify({
        op: 'subscribe',
        args,
      }));

      setConnectionStates(prev => ({
        ...prev,
        bybit: { connected: true, exchange: 'bybit', subscribedSymbols: symbols },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.data && data.topic?.startsWith('tickers.')) {
          const symbol = data.topic.replace('tickers.', '').replace('USDT', '/USDT');
          handlePriceUpdate(symbol, parseFloat(data.data.lastPrice));
        }
      } catch (e) {
        console.error('Error parsing Bybit message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('Bybit WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Bybit WebSocket closed');
      setConnectionStates(prev => ({
        ...prev,
        bybit: { ...prev.bybit, connected: false },
      }));
      
      reconnectTimeouts.current.bybit = setTimeout(() => {
        connectToBybit(symbols);
      }, 5000);
    };

    wsRefs.current.bybit = ws;
  }, [handlePriceUpdate]);

  // Connect to WebSockets when positions change
  useEffect(() => {
    if (positionSymbols.length > 0) {
      // For simplicity, connect to Binance for all symbols
      // In production, you'd connect to the relevant exchange for each position
      connectToBinance(positionSymbols);
    }

    return () => {
      // Cleanup WebSocket connections
      Object.values(wsRefs.current).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      
      // Clear reconnect timeouts
      Object.values(reconnectTimeouts.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, [positionSymbols.join(','), connectToBinance]);

  const getPrice = useCallback((symbol: string): number | null => {
    return prices[symbol] || null;
  }, [prices]);

  const isConnected = useCallback((exchange: string): boolean => {
    return connectionStates[exchange]?.connected || false;
  }, [connectionStates]);

  return {
    prices,
    connectionStates,
    getPrice,
    isConnected,
  };
}

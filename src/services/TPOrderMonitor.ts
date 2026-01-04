/**
 * TPOrderMonitor - WebSocket monitor for take-profit order fills
 * 
 * Subscribes to exchange order update streams to detect when
 * take-profit orders are filled and updates positions in real-time.
 */

import { supabase } from '@/integrations/supabase/client';

interface OrderFillEvent {
  orderId: string;
  symbol: string;
  fillPrice: number;
  fillQuantity: number;
  status: 'filled' | 'partial' | 'cancelled';
  exchange: string;
}

type OrderFillCallback = (event: OrderFillEvent) => void;

class TPOrderMonitor {
  private wsConnections: Map<string, WebSocket> = new Map();
  private callbacks: Set<OrderFillCallback> = new Set();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isMonitoring = false;

  // Exchange-specific WebSocket endpoints for order updates (requires auth)
  private readonly ORDER_WS_ENDPOINTS: Record<string, string> = {
    binance: 'wss://stream.binance.com:9443/ws',
    okx: 'wss://ws.okx.com:8443/ws/v5/private',
    bybit: 'wss://stream.bybit.com/v5/private',
  };

  /**
   * Start monitoring for TP order fills across all exchanges
   */
  start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    console.log('[TPOrderMonitor] Starting TP order fill monitoring...');
    
    // For now, use polling-based approach since private WebSockets require
    // server-side auth. We'll check position TP status every few seconds.
    this.startPollingCheck();
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    
    // Close all WebSocket connections
    this.wsConnections.forEach((ws, exchange) => {
      ws.close();
      console.log(`[TPOrderMonitor] Closed ${exchange} WebSocket`);
    });
    this.wsConnections.clear();
    
    // Clear reconnect timeouts
    this.reconnectTimeouts.forEach(timeout => clearTimeout(timeout));
    this.reconnectTimeouts.clear();
    
    console.log('[TPOrderMonitor] Stopped monitoring');
  }

  /**
   * Subscribe to order fill events
   */
  onOrderFill(callback: OrderFillCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Polling-based check for TP fills
   * This is a fallback until we implement authenticated WebSocket connections
   */
  private pollingInterval: NodeJS.Timeout | null = null;
  
  private startPollingCheck() {
    if (this.pollingInterval) return;
    
    const checkTPFills = async () => {
      if (!this.isMonitoring) return;
      
      try {
        // Get positions with pending TP orders
        const { data: positions } = await supabase
          .from('positions')
          .select('*')
          .eq('status', 'open')
          .not('take_profit_order_id', 'is', null)
          .is('take_profit_filled_at', null);
        
        if (!positions || positions.length === 0) return;
        
        // For each position with a pending TP, we would check the exchange
        // For now, this is handled by the profit check in TradingContext
        // This service will be extended when we add authenticated WebSocket support
        
        console.log(`[TPOrderMonitor] Monitoring ${positions.length} positions with pending TP orders`);
      } catch (error) {
        console.error('[TPOrderMonitor] Error checking TP fills:', error);
      }
    };
    
    // Check every 2 seconds
    this.pollingInterval = setInterval(checkTPFills, 2000);
    checkTPFills(); // Initial check
  }

  /**
   * Emit order fill event to all subscribers
   */
  private emitOrderFill(event: OrderFillEvent) {
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[TPOrderMonitor] Error in callback:', error);
      }
    });
  }

  /**
   * Update position when TP order is filled
   */
  async updatePositionOnTPFill(positionId: string, fillPrice: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('positions')
        .update({
          take_profit_status: 'filled',
          take_profit_filled_at: new Date().toISOString(),
          current_price: fillPrice,
        })
        .eq('id', positionId);
      
      if (error) {
        console.error('[TPOrderMonitor] Failed to update position:', error);
        return;
      }
      
      console.log(`[TPOrderMonitor] Position ${positionId} TP filled at ${fillPrice}`);
    } catch (error) {
      console.error('[TPOrderMonitor] Error updating position:', error);
    }
  }

  /**
   * Check if monitoring is active
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

// Singleton instance
export const tpOrderMonitor = new TPOrderMonitor();

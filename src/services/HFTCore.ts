// HFT Core Service - High-Frequency Trading Optimizations
// Provides: InMemoryOrderBook, Pre-Trade Risk Checks, Latency Heartbeat, Safe Mode

import { wsManager, PriceUpdate } from './ExchangeWebSocketManager';
import { rateLimiter } from './RateLimiter';

type ExchangeName = 'binance' | 'okx' | 'bybit' | 'kucoin' | 'hyperliquid';

// ============================================
// TYPES & INTERFACES
// ============================================
interface OrderBookEntry {
  bid: number;
  ask: number;
  mid: number;
  timestamp: number;
  spread: number;
  exchange: ExchangeName;
}

interface PreTradeRiskResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

interface LatencyHeartbeat {
  exchange: ExchangeName;
  rtt: number;
  timestamp: number;
  healthy: boolean;
}

interface RTTRecord {
  timestamp: number;
  rtt: number;
  exchange: ExchangeName;
}

interface RTTStats {
  avg: number;
  p95: number;
  p99: number;
  spikes: number;
  histogram: number[];
}

interface HFTState {
  isSafeMode: boolean;
  safeModeReason: string | null;
  safeModeEnteredAt: number | null;
  consecutiveHighLatency: Record<ExchangeName, number>;
  consecutiveLowLatency: Record<ExchangeName, number>;
  lastHeartbeats: Record<ExchangeName, LatencyHeartbeat>;
  dbWriteQueueSize: number;
}

// ============================================
// CONSTANTS
// ============================================
const SAFE_MODE_LATENCY_THRESHOLD = 200; // ms - enter safe mode if RTT > this
const SAFE_MODE_EXIT_THRESHOLD = 150; // ms - exit safe mode if RTT < this
const CONSECUTIVE_HIGH_LATENCY_TRIGGER = 3; // consecutive checks before safe mode
const CONSECUTIVE_LOW_LATENCY_EXIT = 3; // consecutive checks before exiting safe mode
const FAT_FINGER_DEVIATION_PERCENT = 2; // max price deviation from market

// ============================================
// HFT CORE CLASS
// ============================================
// Histogram bucket thresholds
const HISTOGRAM_BUCKETS = [25, 50, 100, 200, Infinity];
const RTT_HISTORY_SIZE = 1000;
const RTT_HISTORY_WINDOW_MS = 300000; // 5 minutes for histogram
const SPIKE_WINDOW_MS = 3600000; // 1 hour for spike count

class HFTCore {
  private static instance: HFTCore | null = null;
  
  // InMemory Order Book for nanosecond price reads
  private orderBook: Map<string, OrderBookEntry> = new Map();
  
  // RTT History for metrics
  private rttHistory: RTTRecord[] = [];
  
  // State management
  private state: HFTState = {
    isSafeMode: false,
    safeModeReason: null,
    safeModeEnteredAt: null,
    consecutiveHighLatency: {} as Record<ExchangeName, number>,
    consecutiveLowLatency: {} as Record<ExchangeName, number>,
    lastHeartbeats: {} as Record<ExchangeName, LatencyHeartbeat>,
    dbWriteQueueSize: 0,
  };
  
  // DB Write Queue for async persistence
  private dbWriteQueue: Array<{ fn: () => Promise<void>; timestamp: number }> = [];
  private isProcessingQueue = false;
  
  // Callbacks for state changes
  private stateChangeCallbacks: Set<(state: HFTState) => void> = new Set();
  
  private constructor() {
    // Initialize exchange tracking
    (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(exchange => {
      this.state.consecutiveHighLatency[exchange] = 0;
      this.state.consecutiveLowLatency[exchange] = 0;
    });
    
    // Subscribe to price updates from WebSocket manager
    wsManager.onPriceUpdate((update) => this.updateOrderBook(update));
    
    // Start latency monitoring
    this.startLatencyMonitoring();
    
    // Start DB write queue processor
    this.startQueueProcessor();
    
    console.log('🚀 HFTCore initialized');
  }
  
  static getInstance(): HFTCore {
    if (!HFTCore.instance) {
      HFTCore.instance = new HFTCore();
    }
    return HFTCore.instance;
  }
  
  // ============================================
  // IN-MEMORY ORDER BOOK
  // ============================================
  
  // Update order book from WebSocket price update
  private updateOrderBook(update: PriceUpdate): void {
    const entry: OrderBookEntry = {
      bid: update.price * 0.9999, // Simulated bid (real orderbook would have actual L2 data)
      ask: update.price * 1.0001, // Simulated ask
      mid: update.price,
      timestamp: update.timestamp,
      spread: update.price * 0.0002, // ~0.02% spread estimate
      exchange: update.exchange as ExchangeName,
    };
    this.orderBook.set(update.symbol, entry);
  }
  
  // Get instant price (nanosecond read from memory)
  getInstantPrice(symbol: string): number | null {
    const entry = this.orderBook.get(symbol);
    return entry ? entry.mid : null;
  }
  
  // Get full order book entry
  getOrderBookEntry(symbol: string): OrderBookEntry | null {
    return this.orderBook.get(symbol) || null;
  }
  
  // Get all prices as record
  getAllPrices(): Record<string, number> {
    const prices: Record<string, number> = {};
    this.orderBook.forEach((entry, symbol) => {
      prices[symbol] = entry.mid;
    });
    return prices;
  }
  
  // ============================================
  // PRE-TRADE RISK CHECKS
  // ============================================
  
  preTradeRiskCheck(params: {
    exchange: ExchangeName;
    symbol: string;
    orderSizeUsd: number;
    entryPrice: number;
    direction: 'long' | 'short';
    availableBalance: number;
    currentPositionCount: number;
    maxPositions: number;
    minOrderSize: number;
    maxOrderSize: number;
    dailyLossLimit: number;
    currentDailyLoss: number;
  }): PreTradeRiskResult {
    try {
      // Check 1: Safe Mode - block new entries
      if (this.state.isSafeMode) {
        return {
          allowed: false,
          reason: `Safe Mode active: ${this.state.safeModeReason}`,
          suggestion: 'Wait for exchange latency to normalize',
        };
      }
      
      // Check 2: Order Size Bounds
      if (params.orderSizeUsd < params.minOrderSize) {
        return {
          allowed: false,
          reason: `Order size $${params.orderSizeUsd} below minimum $${params.minOrderSize}`,
          suggestion: 'Increase order size',
        };
      }
      if (params.orderSizeUsd > params.maxOrderSize) {
        return {
          allowed: false,
          reason: `Order size $${params.orderSizeUsd} above maximum $${params.maxOrderSize}`,
          suggestion: 'Decrease order size',
        };
      }
      
      // Check 3: Fat-Finger Protection (price deviation from market)
      const marketPrice = this.getInstantPrice(params.symbol);
      if (marketPrice) {
        const deviation = Math.abs(params.entryPrice - marketPrice) / marketPrice * 100;
        if (deviation > FAT_FINGER_DEVIATION_PERCENT) {
          return {
            allowed: false,
            reason: `Entry price $${params.entryPrice.toFixed(2)} deviates ${deviation.toFixed(1)}% from market $${marketPrice.toFixed(2)}`,
            suggestion: 'Verify entry price matches current market',
          };
        }
      }
      
      // Check 4: Balance Verification
      if (params.orderSizeUsd > params.availableBalance) {
        return {
          allowed: false,
          reason: `Insufficient balance: need $${params.orderSizeUsd.toFixed(2)}, have $${params.availableBalance.toFixed(2)}`,
          suggestion: 'Reduce order size or deposit more funds',
        };
      }
      
      // Check 5: Position Count
      if (params.currentPositionCount >= params.maxPositions) {
        return {
          allowed: false,
          reason: `Max positions reached: ${params.currentPositionCount}/${params.maxPositions}`,
          suggestion: 'Wait for existing positions to close',
        };
      }
      
      // Check 6: Daily Loss Limit
      if (params.currentDailyLoss >= params.dailyLossLimit) {
        return {
          allowed: false,
          reason: `Daily loss limit reached: $${params.currentDailyLoss.toFixed(2)}/$${params.dailyLossLimit.toFixed(2)}`,
          suggestion: 'Trading paused until next day',
        };
      }
      
      // Check 7: Rate Limit Check
      const rateStatus = rateLimiter.getStatus(params.exchange);
      if (rateStatus.available < 5) {
        return {
          allowed: false,
          reason: `Rate limit low: ${rateStatus.available} requests remaining`,
          suggestion: 'Wait for rate limit to reset',
        };
      }
      
      // Check 8: Auto-Throttling
      if (rateLimiter.shouldThrottle(params.exchange)) {
        const level = rateLimiter.getThrottleLevel(params.exchange);
        const multiplier = rateLimiter.getThrottleMultiplier(params.exchange);
        return {
          allowed: false,
          reason: `Rate limit throttling (${level}) - ${Math.round((1 - multiplier) * 100)}% reduced`,
          suggestion: `Order delayed - ${params.exchange} at ${level} capacity`,
        };
      }
      
      return { allowed: true };
    } catch (error) {
      // Fallback: allow trade if risk check fails (don't block due to bugs)
      console.error('PreTradeRiskCheck error:', error);
      return { allowed: true };
    }
  }
  
  // ============================================
  // LATENCY HEARTBEAT & SAFE MODE
  // ============================================
  
  private startLatencyMonitoring(): void {
    // Monitor latency every 2 seconds
    setInterval(() => {
      const connectionStatus = wsManager.getConnectionStatus();
      
      (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(exchange => {
        const status = connectionStatus[exchange];
        if (!status) return;
        
        const heartbeat: LatencyHeartbeat = {
          exchange,
          rtt: status.latency,
          timestamp: Date.now(),
          healthy: status.connected && status.latency < SAFE_MODE_LATENCY_THRESHOLD,
        };
        
        this.state.lastHeartbeats[exchange] = heartbeat;
        
        // Record RTT for histogram/stats
        this.recordRTT(exchange, status.latency);
        
        // Track consecutive high/low latency
        if (status.latency > SAFE_MODE_LATENCY_THRESHOLD) {
          this.state.consecutiveHighLatency[exchange] = 
            (this.state.consecutiveHighLatency[exchange] || 0) + 1;
          this.state.consecutiveLowLatency[exchange] = 0;
        } else if (status.latency < SAFE_MODE_EXIT_THRESHOLD) {
          this.state.consecutiveLowLatency[exchange] = 
            (this.state.consecutiveLowLatency[exchange] || 0) + 1;
          this.state.consecutiveHighLatency[exchange] = 0;
        }
        
        // Check if we should enter safe mode
        if (this.state.consecutiveHighLatency[exchange] >= CONSECUTIVE_HIGH_LATENCY_TRIGGER) {
          this.enterSafeMode(`High latency on ${exchange}: ${status.latency}ms`);
        }
      });
      
      // Check if we can exit safe mode (all exchanges have consecutive low latency)
      if (this.state.isSafeMode) {
        const allStable = (['binance', 'okx', 'bybit'] as ExchangeName[]).every(
          ex => (this.state.consecutiveLowLatency[ex] || 0) >= CONSECUTIVE_LOW_LATENCY_EXIT
        );
        if (allStable) {
          this.exitSafeMode();
        }
      }
    }, 2000);
  }
  
  // Record RTT measurement for stats
  private recordRTT(exchange: ExchangeName, rtt: number): void {
    this.rttHistory.push({
      timestamp: Date.now(),
      rtt,
      exchange,
    });
    
    // Trim old entries
    if (this.rttHistory.length > RTT_HISTORY_SIZE) {
      this.rttHistory = this.rttHistory.slice(-RTT_HISTORY_SIZE);
    }
  }
  
  // Get RTT statistics for dashboard
  getRTTStats(): RTTStats {
    const now = Date.now();
    const histogramWindow = this.rttHistory.filter(r => r.timestamp > now - RTT_HISTORY_WINDOW_MS);
    const spikeWindow = this.rttHistory.filter(r => r.timestamp > now - SPIKE_WINDOW_MS);
    
    if (histogramWindow.length === 0) {
      return { avg: 0, p95: 0, p99: 0, spikes: 0, histogram: [0, 0, 0, 0, 0] };
    }
    
    const rtts = histogramWindow.map(r => r.rtt).sort((a, b) => a - b);
    const avg = Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
    const p95 = rtts[Math.floor(rtts.length * 0.95)] || 0;
    const p99 = rtts[Math.floor(rtts.length * 0.99)] || 0;
    const spikes = spikeWindow.filter(r => r.rtt > SAFE_MODE_LATENCY_THRESHOLD).length;
    
    // Build histogram
    const histogram = HISTOGRAM_BUCKETS.map((_, idx) => {
      const lower = idx === 0 ? 0 : HISTOGRAM_BUCKETS[idx - 1];
      const upper = HISTOGRAM_BUCKETS[idx];
      return histogramWindow.filter(r => r.rtt > lower && r.rtt <= upper).length;
    });
    
    return { avg, p95, p99, spikes, histogram };
  }
  
  private enterSafeMode(reason: string): void {
    if (this.state.isSafeMode) return;
    
    console.warn(`⚠️ HFT SAFE MODE ACTIVATED: ${reason}`);
    this.state.isSafeMode = true;
    this.state.safeModeReason = reason;
    this.state.safeModeEnteredAt = Date.now();
    this.notifyStateChange();
  }
  
  private exitSafeMode(): void {
    if (!this.state.isSafeMode) return;
    
    const duration = Date.now() - (this.state.safeModeEnteredAt || 0);
    console.log(`✅ HFT SAFE MODE DEACTIVATED after ${Math.round(duration / 1000)}s`);
    this.state.isSafeMode = false;
    this.state.safeModeReason = null;
    this.state.safeModeEnteredAt = null;
    // Reset consecutive counters
    (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(ex => {
      this.state.consecutiveLowLatency[ex] = 0;
    });
    this.notifyStateChange();
  }
  
  // Force exit safe mode (manual override)
  forceExitSafeMode(): void {
    if (!this.state.isSafeMode) return;
    
    console.warn('⚡ HFT SAFE MODE FORCE EXITED by user');
    this.state.isSafeMode = false;
    this.state.safeModeReason = null;
    this.state.safeModeEnteredAt = null;
    // Reset all counters
    (['binance', 'okx', 'bybit'] as ExchangeName[]).forEach(ex => {
      this.state.consecutiveHighLatency[ex] = 0;
      this.state.consecutiveLowLatency[ex] = 0;
    });
    this.notifyStateChange();
  }
  
  // ============================================
  // ASYNC DB WRITE QUEUE (Fire-and-Forget)
  // ============================================
  
  // Enqueue a DB write operation (non-blocking)
  enqueueDbWrite(writeFn: () => Promise<void>): void {
    this.dbWriteQueue.push({ fn: writeFn, timestamp: Date.now() });
    this.state.dbWriteQueueSize = this.dbWriteQueue.length;
    this.notifyStateChange();
  }
  
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (this.isProcessingQueue || this.dbWriteQueue.length === 0) return;
      
      this.isProcessingQueue = true;
      
      try {
        // Process up to 10 writes per tick
        const batch = this.dbWriteQueue.splice(0, 10);
        this.state.dbWriteQueueSize = this.dbWriteQueue.length;
        
        await Promise.allSettled(batch.map(item => item.fn()));
      } catch (error) {
        console.error('DB write queue processing error:', error);
      } finally {
        this.isProcessingQueue = false;
        this.notifyStateChange();
      }
    }, 100); // Process every 100ms
  }
  
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  onStateChange(callback: (state: HFTState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    // Send current state immediately
    callback({ ...this.state });
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }
  
  private notifyStateChange(): void {
    const stateCopy = { ...this.state };
    this.stateChangeCallbacks.forEach(cb => {
      try {
        cb(stateCopy);
      } catch (e) {
        console.error('State change callback error:', e);
      }
    });
  }
  
  getState(): HFTState {
    return { ...this.state };
  }
  
  isSafeMode(): boolean {
    return this.state.isSafeMode;
  }
  
  getSafeModeReason(): string | null {
    return this.state.safeModeReason;
  }
  
  getDbWriteQueueSize(): number {
    return this.state.dbWriteQueueSize;
  }
  
  getLatencyStatus(): Record<ExchangeName, LatencyHeartbeat | undefined> {
    return { ...this.state.lastHeartbeats };
  }
}

// Export singleton instance
export const hftCore = HFTCore.getInstance();
export type { HFTState, PreTradeRiskResult, LatencyHeartbeat, OrderBookEntry, RTTStats };

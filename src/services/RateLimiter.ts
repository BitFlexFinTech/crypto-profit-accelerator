// Rate limiting service with per-exchange configuration

type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstLimit: number;
}

interface RequestRecord {
  timestamp: number;
}

const EXCHANGE_LIMITS: Record<ExchangeName, RateLimitConfig> = {
  binance: { requestsPerSecond: 10, requestsPerMinute: 1200, burstLimit: 5 },
  okx: { requestsPerSecond: 6, requestsPerMinute: 600, burstLimit: 3 },
  bybit: { requestsPerSecond: 5, requestsPerMinute: 500, burstLimit: 3 },
  kucoin: { requestsPerSecond: 3, requestsPerMinute: 300, burstLimit: 2 },
  nexo: { requestsPerSecond: 2, requestsPerMinute: 200, burstLimit: 2 },
  hyperliquid: { requestsPerSecond: 10, requestsPerMinute: 1000, burstLimit: 5 },
};

class RateLimiter {
  private requests: Map<ExchangeName, RequestRecord[]> = new Map();
  private queues: Map<ExchangeName, Array<() => void>> = new Map();

  constructor() {
    // Initialize maps for all exchanges
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      this.requests.set(exchange as ExchangeName, []);
      this.queues.set(exchange as ExchangeName, []);
    });
  }

  private cleanOldRequests(exchange: ExchangeName): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const records = this.requests.get(exchange) || [];
    this.requests.set(
      exchange,
      records.filter((r) => r.timestamp > oneMinuteAgo)
    );
  }

  private getRecentRequestCount(exchange: ExchangeName, windowMs: number): number {
    const now = Date.now();
    const records = this.requests.get(exchange) || [];
    return records.filter((r) => r.timestamp > now - windowMs).length;
  }

  canMakeRequest(exchange: ExchangeName): boolean {
    this.cleanOldRequests(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    
    const requestsInSecond = this.getRecentRequestCount(exchange, 1000);
    const requestsInMinute = this.getRecentRequestCount(exchange, 60000);
    
    return (
      requestsInSecond < config.requestsPerSecond &&
      requestsInMinute < config.requestsPerMinute
    );
  }

  recordRequest(exchange: ExchangeName): void {
    const records = this.requests.get(exchange) || [];
    records.push({ timestamp: Date.now() });
    this.requests.set(exchange, records);
  }

  async waitForSlot(exchange: ExchangeName): Promise<void> {
    if (this.canMakeRequest(exchange)) {
      this.recordRequest(exchange);
      return;
    }

    return new Promise((resolve) => {
      const queue = this.queues.get(exchange) || [];
      queue.push(() => {
        this.recordRequest(exchange);
        resolve();
      });
      this.queues.set(exchange, queue);

      // Process queue after delay
      setTimeout(() => this.processQueue(exchange), 1000 / EXCHANGE_LIMITS[exchange].requestsPerSecond);
    });
  }

  private processQueue(exchange: ExchangeName): void {
    const queue = this.queues.get(exchange) || [];
    if (queue.length > 0 && this.canMakeRequest(exchange)) {
      const next = queue.shift();
      this.queues.set(exchange, queue);
      if (next) next();
    }

    // Continue processing if queue has items
    if (queue.length > 0) {
      setTimeout(() => this.processQueue(exchange), 1000 / EXCHANGE_LIMITS[exchange].requestsPerSecond);
    }
  }

  getStatus(exchange: ExchangeName): { used: number; limit: number; available: number } {
    this.cleanOldRequests(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    const used = this.getRecentRequestCount(exchange, 60000);
    return {
      used,
      limit: config.requestsPerMinute,
      available: config.requestsPerMinute - used,
    };
  }

  getAllStatus(): Record<ExchangeName, { used: number; limit: number; available: number }> {
    const result = {} as Record<ExchangeName, { used: number; limit: number; available: number }>;
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      result[exchange as ExchangeName] = this.getStatus(exchange as ExchangeName);
    });
    return result;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

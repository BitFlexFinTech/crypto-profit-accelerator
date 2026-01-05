// Rate limiting service with Leaky Bucket algorithm and dynamic header parsing
// Supports X-MBX-USED-WEIGHT (Binance) and x-ratelimit-* headers (OKX, Bybit)

type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstLimit: number;
  // Leaky bucket parameters
  bucketSize: number;
  leakRatePerSecond: number;
}

interface RequestRecord {
  timestamp: number;
  weight: number; // API weight for this request
}

interface BucketState {
  tokens: number;
  lastLeakTime: number;
  usedWeight: number; // From API headers
  weightLimit: number; // From API headers
}

// OPTIMIZED: Maximum throughput while staying within exchange limits
const EXCHANGE_LIMITS: Record<ExchangeName, RateLimitConfig> = {
  binance: { 
    requestsPerSecond: 20, 
    requestsPerMinute: 2400, 
    burstLimit: 10,
    bucketSize: 100, // Max tokens
    leakRatePerSecond: 20, // Tokens regenerate per second
  },
  okx: { 
    requestsPerSecond: 10, 
    requestsPerMinute: 600, 
    burstLimit: 5,
    bucketSize: 50,
    leakRatePerSecond: 10,
  },
  bybit: { 
    requestsPerSecond: 10, 
    requestsPerMinute: 600, 
    burstLimit: 5,
    bucketSize: 50,
    leakRatePerSecond: 10,
  },
  kucoin: { 
    requestsPerSecond: 6, 
    requestsPerMinute: 360, 
    burstLimit: 3,
    bucketSize: 30,
    leakRatePerSecond: 6,
  },
  nexo: { 
    requestsPerSecond: 5, 
    requestsPerMinute: 300, 
    burstLimit: 3,
    bucketSize: 25,
    leakRatePerSecond: 5,
  },
  hyperliquid: { 
    requestsPerSecond: 20, 
    requestsPerMinute: 1200, 
    burstLimit: 10,
    bucketSize: 100,
    leakRatePerSecond: 20,
  },
};

// Danger threshold (percentage of capacity used)
const DANGER_THRESHOLD = 0.8;

class RateLimiter {
  private requests: Map<ExchangeName, RequestRecord[]> = new Map();
  private queues: Map<ExchangeName, Array<() => void>> = new Map();
  private buckets: Map<ExchangeName, BucketState> = new Map();

  constructor() {
    // Initialize maps for all exchanges
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      const ex = exchange as ExchangeName;
      const config = EXCHANGE_LIMITS[ex];
      this.requests.set(ex, []);
      this.queues.set(ex, []);
      this.buckets.set(ex, {
        tokens: config.bucketSize,
        lastLeakTime: Date.now(),
        usedWeight: 0,
        weightLimit: config.requestsPerMinute,
      });
    });
  }

  // Leaky bucket: replenish tokens based on elapsed time
  private leakBucket(exchange: ExchangeName): void {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    if (!bucket) return;

    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastLeakTime) / 1000;
    const tokensToAdd = elapsedSeconds * config.leakRatePerSecond;
    
    bucket.tokens = Math.min(config.bucketSize, bucket.tokens + tokensToAdd);
    bucket.lastLeakTime = now;
    this.buckets.set(exchange, bucket);
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

  private getTotalWeight(exchange: ExchangeName, windowMs: number): number {
    const now = Date.now();
    const records = this.requests.get(exchange) || [];
    return records
      .filter((r) => r.timestamp > now - windowMs)
      .reduce((sum, r) => sum + r.weight, 0);
  }

  canMakeRequest(exchange: ExchangeName, weight: number = 1): boolean {
    this.leakBucket(exchange);
    this.cleanOldRequests(exchange);
    
    const config = EXCHANGE_LIMITS[exchange];
    const bucket = this.buckets.get(exchange);
    
    // Check leaky bucket tokens
    if (!bucket || bucket.tokens < weight) {
      return false;
    }
    
    // Check traditional rate limits
    const requestsInSecond = this.getRecentRequestCount(exchange, 1000);
    const requestsInMinute = this.getRecentRequestCount(exchange, 60000);
    
    // Also check weight-based limits if we have API feedback
    if (bucket.usedWeight > 0) {
      const remainingWeight = bucket.weightLimit - bucket.usedWeight;
      if (remainingWeight < weight * 2) { // Keep buffer
        return false;
      }
    }
    
    return (
      requestsInSecond < config.requestsPerSecond &&
      requestsInMinute < config.requestsPerMinute
    );
  }

  recordRequest(exchange: ExchangeName, weight: number = 1): void {
    const records = this.requests.get(exchange) || [];
    records.push({ timestamp: Date.now(), weight });
    this.requests.set(exchange, records);
    
    // Consume tokens from bucket
    const bucket = this.buckets.get(exchange);
    if (bucket) {
      bucket.tokens = Math.max(0, bucket.tokens - weight);
      this.buckets.set(exchange, bucket);
    }
  }

  // Parse rate limit headers from exchange responses
  parseRateLimitHeaders(exchange: ExchangeName, headers: Headers | Record<string, string>): void {
    const bucket = this.buckets.get(exchange);
    if (!bucket) return;

    const getHeader = (name: string): string | null => {
      if (headers instanceof Headers) {
        return headers.get(name);
      }
      return headers[name] || headers[name.toLowerCase()] || null;
    };

    switch (exchange) {
      case 'binance': {
        // X-MBX-USED-WEIGHT-1M (Binance)
        const usedWeight = getHeader('X-MBX-USED-WEIGHT-1M') || getHeader('x-mbx-used-weight-1m');
        if (usedWeight) {
          bucket.usedWeight = parseInt(usedWeight, 10);
          console.log(`[RateLimiter] Binance used weight: ${bucket.usedWeight}`);
        }
        break;
      }
      case 'okx': {
        // x-ratelimit-remaining (OKX)
        const remaining = getHeader('x-ratelimit-remaining');
        const limit = getHeader('x-ratelimit-limit');
        if (remaining && limit) {
          bucket.usedWeight = parseInt(limit, 10) - parseInt(remaining, 10);
          bucket.weightLimit = parseInt(limit, 10);
          console.log(`[RateLimiter] OKX: ${remaining}/${limit} remaining`);
        }
        break;
      }
      case 'bybit': {
        // X-Bapi-Limit-Status (Bybit)
        const limitStatus = getHeader('X-Bapi-Limit-Status');
        const limit = getHeader('X-Bapi-Limit');
        if (limitStatus) {
          bucket.usedWeight = parseInt(limitStatus, 10);
        }
        if (limit) {
          bucket.weightLimit = parseInt(limit, 10);
        }
        break;
      }
    }
    
    this.buckets.set(exchange, bucket);
  }

  // Check if rate limit usage is dangerous (>80%)
  isDangerous(exchange: ExchangeName): boolean {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    
    if (!bucket) return false;
    
    // Check bucket depletion
    const bucketUsage = 1 - (bucket.tokens / config.bucketSize);
    if (bucketUsage > DANGER_THRESHOLD) {
      return true;
    }
    
    // Check API-reported weight usage
    if (bucket.usedWeight > 0) {
      const weightUsage = bucket.usedWeight / bucket.weightLimit;
      if (weightUsage > DANGER_THRESHOLD) {
        return true;
      }
    }
    
    // Check request count
    const requestsInMinute = this.getRecentRequestCount(exchange, 60000);
    const requestUsage = requestsInMinute / config.requestsPerMinute;
    if (requestUsage > DANGER_THRESHOLD) {
      return true;
    }
    
    return false;
  }

  async waitForSlot(exchange: ExchangeName, weight: number = 1): Promise<void> {
    if (this.canMakeRequest(exchange, weight)) {
      this.recordRequest(exchange, weight);
      return;
    }

    return new Promise((resolve) => {
      const queue = this.queues.get(exchange) || [];
      queue.push(() => {
        this.recordRequest(exchange, weight);
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

  getStatus(exchange: ExchangeName): { 
    used: number; 
    limit: number; 
    available: number;
    bucketTokens: number;
    bucketSize: number;
    isDangerous: boolean;
    apiWeight?: number;
    apiWeightLimit?: number;
  } {
    this.leakBucket(exchange);
    this.cleanOldRequests(exchange);
    
    const config = EXCHANGE_LIMITS[exchange];
    const bucket = this.buckets.get(exchange);
    const used = this.getRecentRequestCount(exchange, 60000);
    
    return {
      used,
      limit: config.requestsPerMinute,
      available: config.requestsPerMinute - used,
      bucketTokens: Math.round(bucket?.tokens || 0),
      bucketSize: config.bucketSize,
      isDangerous: this.isDangerous(exchange),
      apiWeight: bucket?.usedWeight || undefined,
      apiWeightLimit: bucket?.usedWeight ? bucket.weightLimit : undefined,
    };
  }

  getAllStatus(): Record<ExchangeName, ReturnType<typeof this.getStatus>> {
    const result = {} as Record<ExchangeName, ReturnType<typeof this.getStatus>>;
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      result[exchange as ExchangeName] = this.getStatus(exchange as ExchangeName);
    });
    return result;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

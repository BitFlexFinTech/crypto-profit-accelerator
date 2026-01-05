// ============================================
// ENHANCED RATE LIMITER WITH PRIORITY QUEUE
// Bulletproof multi-exchange rate limiting for frontend
// ============================================

export type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';

export enum Priority {
  CRITICAL = 0,  // Order cancellations, emergency stop-losses
  HIGH = 1,      // New order placements
  LOW = 2,       // Tickers, OHLCV, balance updates
}

interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  burstLimit: number;
  bucketSize: number;
  leakRatePerSecond: number;
  throttleAt: number;
  blockAt: number;
}

interface RequestRecord {
  timestamp: number;
  weight: number;
  priority: Priority;
}

interface BucketState {
  tokens: number;
  lastLeakTime: number;
  usedWeight: number;
  weightLimit: number;
  requestsThisSecond: number;
  lastRequestTime: number;
}

interface CooldownState {
  until: number;
  reason: string;
}

interface QueuedRequest<T> {
  priority: Priority;
  weight: number;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

interface TimeOffset {
  offset: number;
  lastSync: number;
}

// Exchange-specific configurations
const EXCHANGE_LIMITS: Record<ExchangeName, RateLimitConfig> = {
  binance: { 
    requestsPerSecond: 20, 
    requestsPerMinute: 2400, 
    burstLimit: 10,
    bucketSize: 100,
    leakRatePerSecond: 20,
    throttleAt: 0.85,
    blockAt: 0.95,
  },
  okx: { 
    requestsPerSecond: 10, 
    requestsPerMinute: 600, 
    burstLimit: 5,
    bucketSize: 50,
    leakRatePerSecond: 10,
    throttleAt: 0.80,
    blockAt: 0.95,
  },
  bybit: { 
    requestsPerSecond: 10, 
    requestsPerMinute: 600, 
    burstLimit: 5,
    bucketSize: 50,
    leakRatePerSecond: 10,
    throttleAt: 0.80,
    blockAt: 0.95,
  },
  kucoin: { 
    requestsPerSecond: 6, 
    requestsPerMinute: 360, 
    burstLimit: 3,
    bucketSize: 30,
    leakRatePerSecond: 6,
    throttleAt: 0.75,
    blockAt: 0.95,
  },
  nexo: { 
    requestsPerSecond: 5, 
    requestsPerMinute: 300, 
    burstLimit: 3,
    bucketSize: 25,
    leakRatePerSecond: 5,
    throttleAt: 0.75,
    blockAt: 0.95,
  },
  hyperliquid: { 
    requestsPerSecond: 20, 
    requestsPerMinute: 1200, 
    burstLimit: 10,
    bucketSize: 100,
    leakRatePerSecond: 20,
    throttleAt: 0.80,
    blockAt: 0.95,
  },
};

// IP Ban detection signals
const IP_BAN_SIGNALS: Record<ExchangeName, { codes: (number | string)[]; messages: string[]; cooldownMs: number }> = {
  binance: {
    codes: [418, -1003, -1015, -1021],
    messages: ['banned', 'ip banned', 'too many requests'],
    cooldownMs: 600000,
  },
  okx: {
    codes: ['50001', '50014', '50011'],
    messages: ['too many requests', 'ip restricted'],
    cooldownMs: 600000,
  },
  bybit: {
    codes: [10006, 10018, 10027],
    messages: ['ip banned', 'too frequent'],
    cooldownMs: 600000,
  },
  kucoin: {
    codes: ['429000', '200004'],
    messages: ['too many requests'],
    cooldownMs: 600000,
  },
  hyperliquid: {
    codes: [429],
    messages: ['rate limit'],
    cooldownMs: 300000,
  },
  nexo: {
    codes: [429],
    messages: ['rate limit'],
    cooldownMs: 300000,
  },
};

// Throttle levels and multipliers
const THROTTLE_THRESHOLDS = {
  normal: 0.60,
  warning: 0.80,
  danger: 0.95,
  critical: 1.0,
} as const;

const THROTTLE_MULTIPLIERS: Record<'normal' | 'warning' | 'danger' | 'critical', number> = {
  normal: 1.0,
  warning: 0.5,
  danger: 0.25,
  critical: 0.0,
};

class RateLimiter {
  private requests: Map<ExchangeName, RequestRecord[]> = new Map();
  private buckets: Map<ExchangeName, BucketState> = new Map();
  private cooldowns: Map<ExchangeName, CooldownState> = new Map();
  private queues: Map<ExchangeName, QueuedRequest<any>[]> = new Map();
  private timeOffsets: Map<ExchangeName, TimeOffset> = new Map();
  private processing: Map<ExchangeName, boolean> = new Map();
  private stats: Map<ExchangeName, { requests: number; blocked: number; retries: number }> = new Map();

  constructor() {
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      const ex = exchange as ExchangeName;
      const config = EXCHANGE_LIMITS[ex];
      this.requests.set(ex, []);
      this.buckets.set(ex, {
        tokens: config.bucketSize,
        lastLeakTime: Date.now(),
        usedWeight: 0,
        weightLimit: config.requestsPerMinute,
        requestsThisSecond: 0,
        lastRequestTime: Date.now(),
      });
      this.queues.set(ex, []);
      this.timeOffsets.set(ex, { offset: 0, lastSync: 0 });
      this.processing.set(ex, false);
      this.stats.set(ex, { requests: 0, blocked: 0, retries: 0 });
    });
  }

  // ============================================
  // LEAKY BUCKET ALGORITHM
  // ============================================
  private leakBucket(exchange: ExchangeName): void {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    if (!bucket) return;

    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastLeakTime) / 1000;
    const tokensToAdd = elapsedSeconds * config.leakRatePerSecond;
    
    bucket.tokens = Math.min(config.bucketSize, bucket.tokens + tokensToAdd);
    
    // Reset per-second counter
    if (now - bucket.lastRequestTime >= 1000) {
      bucket.requestsThisSecond = 0;
      bucket.lastRequestTime = now;
    }
    
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

  // ============================================
  // COOLDOWN / IP BAN MANAGEMENT
  // ============================================
  isInCooldown(exchange: ExchangeName): boolean {
    const cooldown = this.cooldowns.get(exchange);
    if (!cooldown) return false;
    
    if (Date.now() >= cooldown.until) {
      this.cooldowns.delete(exchange);
      console.log(`[RateLimiter] ${exchange}: Cooldown expired`);
      return false;
    }
    return true;
  }

  getCooldownRemaining(exchange: ExchangeName): number {
    const cooldown = this.cooldowns.get(exchange);
    if (!cooldown) return 0;
    return Math.max(0, cooldown.until - Date.now());
  }

  getCooldownReason(exchange: ExchangeName): string | null {
    return this.cooldowns.get(exchange)?.reason || null;
  }

  private setCooldown(exchange: ExchangeName, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    this.cooldowns.set(exchange, { until, reason });
    console.warn(`[RateLimiter] ${exchange}: COOLDOWN for ${durationMs / 1000}s - ${reason}`);
  }

  detectBan(exchange: ExchangeName, status: number, body: any): boolean {
    const signals = IP_BAN_SIGNALS[exchange];
    if (!signals) return false;

    if (signals.codes.includes(status)) {
      this.setCooldown(exchange, signals.cooldownMs, `HTTP ${status}`);
      return true;
    }

    const errorCode = body?.code || body?.retCode || body?.ret_code;
    if (errorCode && signals.codes.includes(String(errorCode))) {
      this.setCooldown(exchange, signals.cooldownMs, `Error code ${errorCode}`);
      return true;
    }

    const errorMsg = (body?.msg || body?.message || body?.retMsg || '').toLowerCase();
    if (signals.messages.some(msg => errorMsg.includes(msg))) {
      this.setCooldown(exchange, signals.cooldownMs, `Message: ${errorMsg}`);
      return true;
    }

    return false;
  }

  // ============================================
  // CAPACITY CHECKS
  // ============================================
  canMakeRequest(exchange: ExchangeName, weight: number = 1): boolean {
    this.leakBucket(exchange);
    this.cleanOldRequests(exchange);
    
    const config = EXCHANGE_LIMITS[exchange];
    const bucket = this.buckets.get(exchange);
    
    if (this.isInCooldown(exchange)) return false;
    if (!bucket || bucket.tokens < weight) return false;
    
    const requestsInSecond = this.getRecentRequestCount(exchange, 1000);
    const requestsInMinute = this.getRecentRequestCount(exchange, 60000);
    
    if (bucket.usedWeight > 0) {
      const remainingWeight = bucket.weightLimit - bucket.usedWeight;
      if (remainingWeight < weight * 2) return false;
    }
    
    return (
      requestsInSecond < config.requestsPerSecond &&
      requestsInMinute < config.requestsPerMinute
    );
  }

  recordRequest(exchange: ExchangeName, weight: number = 1, priority: Priority = Priority.LOW): void {
    const records = this.requests.get(exchange) || [];
    records.push({ timestamp: Date.now(), weight, priority });
    this.requests.set(exchange, records);
    
    const bucket = this.buckets.get(exchange);
    const stats = this.stats.get(exchange);
    if (bucket) {
      bucket.tokens = Math.max(0, bucket.tokens - weight);
      bucket.requestsThisSecond++;
      this.buckets.set(exchange, bucket);
    }
    if (stats) {
      stats.requests++;
      this.stats.set(exchange, stats);
    }
  }

  // ============================================
  // HEADER PARSING
  // ============================================
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
        const usedWeight = getHeader('X-MBX-USED-WEIGHT-1M') || getHeader('x-mbx-used-weight-1m');
        if (usedWeight) {
          bucket.usedWeight = parseInt(usedWeight, 10);
        }
        break;
      }
      case 'okx': {
        const remaining = getHeader('x-ratelimit-remaining');
        const limit = getHeader('x-ratelimit-limit');
        if (remaining && limit) {
          bucket.usedWeight = parseInt(limit, 10) - parseInt(remaining, 10);
          bucket.weightLimit = parseInt(limit, 10);
        }
        break;
      }
      case 'bybit': {
        const limitStatus = getHeader('X-Bapi-Limit-Status');
        const limit = getHeader('X-Bapi-Limit');
        if (limitStatus) bucket.usedWeight = parseInt(limitStatus, 10);
        if (limit) bucket.weightLimit = parseInt(limit, 10);
        break;
      }
    }
    
    this.buckets.set(exchange, bucket);
  }

  // ============================================
  // THROTTLE LEVELS
  // ============================================
  isDangerous(exchange: ExchangeName): boolean {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    if (!bucket) return false;
    
    if (this.isInCooldown(exchange)) return true;
    
    const bucketUsage = 1 - (bucket.tokens / config.bucketSize);
    if (bucketUsage > 0.8) return true;
    
    if (bucket.usedWeight > 0) {
      const weightUsage = bucket.usedWeight / bucket.weightLimit;
      if (weightUsage > 0.8) return true;
    }
    
    return false;
  }

  getThrottleLevel(exchange: ExchangeName): 'normal' | 'warning' | 'danger' | 'critical' {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_LIMITS[exchange];
    if (!bucket) return 'normal';
    
    if (this.isInCooldown(exchange)) return 'critical';
    
    const bucketUsage = 1 - (bucket.tokens / config.bucketSize);
    let apiUsage = 0;
    if (bucket.usedWeight > 0) {
      apiUsage = bucket.usedWeight / bucket.weightLimit;
    }
    const usage = Math.max(bucketUsage, apiUsage);
    
    if (usage >= THROTTLE_THRESHOLDS.danger) return 'critical';
    if (usage >= THROTTLE_THRESHOLDS.warning) return 'danger';
    if (usage >= THROTTLE_THRESHOLDS.normal) return 'warning';
    return 'normal';
  }
  
  getThrottleMultiplier(exchange: ExchangeName): number {
    const level = this.getThrottleLevel(exchange);
    return THROTTLE_MULTIPLIERS[level];
  }
  
  shouldThrottle(exchange: ExchangeName): boolean {
    const multiplier = this.getThrottleMultiplier(exchange);
    if (multiplier === 0) return true;
    if (multiplier === 1) return false;
    return Math.random() > multiplier;
  }
  
  getThrottleDelayMs(exchange: ExchangeName): number {
    const level = this.getThrottleLevel(exchange);
    switch (level) {
      case 'critical': return 5000;
      case 'danger': return 2000;
      case 'warning': return 500;
      default: return 0;
    }
  }

  // ============================================
  // PRIORITY QUEUE
  // ============================================
  getQueueDepth(exchange: ExchangeName): { p0: number; p1: number; p2: number; total: number } {
    const queue = this.queues.get(exchange) || [];
    return {
      p0: queue.filter(r => r.priority === Priority.CRITICAL).length,
      p1: queue.filter(r => r.priority === Priority.HIGH).length,
      p2: queue.filter(r => r.priority === Priority.LOW).length,
      total: queue.length,
    };
  }

  private async processQueue(exchange: ExchangeName): Promise<void> {
    if (this.processing.get(exchange)) return;
    this.processing.set(exchange, true);

    const queue = this.queues.get(exchange) || [];
    
    while (queue.length > 0) {
      queue.sort((a, b) => a.priority - b.priority);
      const request = queue[0];
      
      if (!this.canMakeRequest(exchange, request.weight)) {
        await this.sleep(100);
        continue;
      }

      queue.shift();
      this.queues.set(exchange, queue);
      
      try {
        this.recordRequest(exchange, request.weight, request.priority);
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing.set(exchange, false);
  }

  // ============================================
  // EXECUTE WITH RATE LIMITING
  // ============================================
  async execute<T>(
    exchange: ExchangeName,
    priority: Priority,
    weight: number,
    fn: () => Promise<Response>
  ): Promise<T> {
    if (this.isInCooldown(exchange)) {
      const remaining = this.getCooldownRemaining(exchange);
      throw new Error(`Exchange ${exchange} in cooldown for ${Math.round(remaining / 1000)}s`);
    }

    // CRITICAL priority executes immediately if possible
    if (priority === Priority.CRITICAL && this.canMakeRequest(exchange, weight)) {
      this.recordRequest(exchange, weight, priority);
      const response = await fn();
      this.parseRateLimitHeaders(exchange, response.headers);
      
      if (response.status === 429 || response.status === 418) {
        const body = await response.json().catch(() => ({}));
        this.detectBan(exchange, response.status, body);
        throw new Error(`Rate limit exceeded: ${response.status}`);
      }
      
      return response.json();
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      const queue = this.queues.get(exchange) || [];
      queue.push({
        priority,
        weight,
        fn: async () => {
          const response = await fn();
          this.parseRateLimitHeaders(exchange, response.headers);
          
          if (response.status === 429 || response.status === 418) {
            const body = await response.json().catch(() => ({}));
            this.detectBan(exchange, response.status, body);
            throw new Error(`Rate limit exceeded: ${response.status}`);
          }
          
          return response.json();
        },
        resolve,
        reject,
        createdAt: Date.now(),
      });
      this.queues.set(exchange, queue);
      this.processQueue(exchange);
    });
  }

  // ============================================
  // LEGACY WAIT FOR SLOT
  // ============================================
  async waitForSlot(exchange: ExchangeName, weight: number = 1): Promise<void> {
    while (!this.canMakeRequest(exchange, weight)) {
      await this.sleep(100);
    }
    this.recordRequest(exchange, weight);
  }

  // ============================================
  // CLOCK SYNC
  // ============================================
  async syncServerTime(exchange: ExchangeName): Promise<number> {
    const timeOffset = this.timeOffsets.get(exchange);
    const now = Date.now();
    
    if (timeOffset && now - timeOffset.lastSync < 30 * 60 * 1000) {
      return timeOffset.offset;
    }

    try {
      let serverTime: number;
      const localBefore = Date.now();

      switch (exchange) {
        case 'binance': {
          const res = await fetch('https://api.binance.com/api/v3/time');
          const data = await res.json();
          serverTime = data.serverTime;
          break;
        }
        case 'okx': {
          const res = await fetch('https://www.okx.com/api/v5/public/time');
          const data = await res.json();
          serverTime = parseInt(data.data?.[0]?.ts || String(Date.now()));
          break;
        }
        case 'bybit': {
          const res = await fetch('https://api.bybit.com/v5/market/time');
          const data = await res.json();
          serverTime = parseInt(data.result?.timeSecond || String(Date.now() / 1000)) * 1000;
          break;
        }
        default:
          return 0;
      }

      const localAfter = Date.now();
      const latency = (localAfter - localBefore) / 2;
      const offset = serverTime - (localBefore + latency);

      this.timeOffsets.set(exchange, { offset, lastSync: now });
      console.log(`[RateLimiter] ${exchange} clock sync: offset=${offset}ms`);
      return offset;
    } catch (error) {
      console.error(`[RateLimiter] ${exchange} clock sync failed:`, error);
      return timeOffset?.offset || 0;
    }
  }

  getClockOffset(exchange: ExchangeName): number {
    return this.timeOffsets.get(exchange)?.offset || 0;
  }

  getLastClockSync(exchange: ExchangeName): number {
    return this.timeOffsets.get(exchange)?.lastSync || 0;
  }

  // ============================================
  // STATUS & MONITORING
  // ============================================
  getStatus(exchange: ExchangeName): { 
    used: number; 
    limit: number; 
    available: number;
    bucketTokens: number;
    bucketSize: number;
    isDangerous: boolean;
    apiWeight?: number;
    apiWeightLimit?: number;
    throttleLevel: 'normal' | 'warning' | 'danger' | 'critical';
    throttleMultiplier: number;
    queueDepth: { p0: number; p1: number; p2: number; total: number };
    isCoolingDown: boolean;
    cooldownRemaining: number;
    cooldownReason: string | null;
    clockOffset: number;
    lastClockSync: number;
    stats: { requests: number; blocked: number; retries: number };
  } {
    this.leakBucket(exchange);
    this.cleanOldRequests(exchange);
    
    const config = EXCHANGE_LIMITS[exchange];
    const bucket = this.buckets.get(exchange);
    const stats = this.stats.get(exchange) || { requests: 0, blocked: 0, retries: 0 };
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
      throttleLevel: this.getThrottleLevel(exchange),
      throttleMultiplier: this.getThrottleMultiplier(exchange),
      queueDepth: this.getQueueDepth(exchange),
      isCoolingDown: this.isInCooldown(exchange),
      cooldownRemaining: this.getCooldownRemaining(exchange),
      cooldownReason: this.getCooldownReason(exchange),
      clockOffset: this.getClockOffset(exchange),
      lastClockSync: this.getLastClockSync(exchange),
      stats,
    };
  }

  getAllStatus(): Record<ExchangeName, ReturnType<typeof this.getStatus>> {
    const result = {} as Record<ExchangeName, ReturnType<typeof this.getStatus>>;
    Object.keys(EXCHANGE_LIMITS).forEach((exchange) => {
      result[exchange as ExchangeName] = this.getStatus(exchange as ExchangeName);
    });
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

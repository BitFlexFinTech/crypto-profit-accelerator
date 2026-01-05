// ============================================
// CENTRALIZED RATE LIMIT MANAGER FOR EDGE FUNCTIONS
// Bulletproof multi-exchange rate limiting with priority queue
// ============================================

export type ExchangeName = 'binance' | 'okx' | 'bybit' | 'kucoin' | 'hyperliquid' | 'nexo';

export enum Priority {
  CRITICAL = 0,  // Order cancellations, emergency stop-losses
  HIGH = 1,      // New order placements
  LOW = 2,       // Tickers, OHLCV, balance updates
}

interface RateLimitConfig {
  weightLimit: number;       // Per minute/window
  requestsPerSecond: number;
  orderLimit: number;        // Orders per second
  throttleAt: number;        // Percentage to start throttling
  blockAt: number;           // Percentage to block requests
  usedWeightHeader: string;  // Header name for used weight
  limitHeader: string;       // Header name for limit
}

interface BucketState {
  tokens: number;
  lastLeakTime: number;
  usedWeight: number;
  weightLimit: number;
  ordersThisSecond: number;
  lastOrderTime: number;
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

// Exchange-specific configurations based on official documentation
const EXCHANGE_CONFIGS: Record<ExchangeName, RateLimitConfig> = {
  binance: {
    weightLimit: 2400,        // 2400 weight per minute
    requestsPerSecond: 20,    // ~20 RPS
    orderLimit: 10,           // 10 orders per second
    throttleAt: 0.85,         // Start throttling at 85%
    blockAt: 0.95,            // Block at 95%
    usedWeightHeader: 'x-mbx-used-weight-1m',
    limitHeader: 'x-mbx-limit',
  },
  okx: {
    weightLimit: 60,          // 60 requests per 2 seconds
    requestsPerSecond: 30,    // Effective 30 RPS
    orderLimit: 20,           // 20 orders per second
    throttleAt: 0.80,
    blockAt: 0.95,
    usedWeightHeader: 'x-ratelimit-remaining',
    limitHeader: 'x-ratelimit-limit',
  },
  bybit: {
    weightLimit: 120,         // 120 requests per second (IP)
    requestsPerSecond: 120,
    orderLimit: 10,           // 10 orders per second
    throttleAt: 0.80,
    blockAt: 0.95,
    usedWeightHeader: 'x-bapi-limit-status',
    limitHeader: 'x-bapi-limit',
  },
  kucoin: {
    weightLimit: 30,          // 30 requests per second
    requestsPerSecond: 30,
    orderLimit: 9,            // 9 orders per second
    throttleAt: 0.75,
    blockAt: 0.95,
    usedWeightHeader: 'gw-ratelimit-remaining',
    limitHeader: 'gw-ratelimit-limit',
  },
  hyperliquid: {
    weightLimit: 100,
    requestsPerSecond: 20,
    orderLimit: 10,
    throttleAt: 0.80,
    blockAt: 0.95,
    usedWeightHeader: '',
    limitHeader: '',
  },
  nexo: {
    weightLimit: 30,
    requestsPerSecond: 5,
    orderLimit: 5,
    throttleAt: 0.75,
    blockAt: 0.95,
    usedWeightHeader: '',
    limitHeader: '',
  },
};

// IP Ban detection signals per exchange
const IP_BAN_SIGNALS: Record<ExchangeName, { codes: (number | string)[]; messages: string[]; cooldownMs: number }> = {
  binance: {
    codes: [418, -1003, -1015, -1021],
    messages: ['banned', 'ip banned', 'too many requests'],
    cooldownMs: 600000, // 10 minutes
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

// Request weight assignments
export const REQUEST_WEIGHTS: Record<string, number> = {
  // Binance weights
  'binance:cancel': 1,
  'binance:order': 1,
  'binance:balance': 10,
  'binance:ticker': 1,
  'binance:klines': 1,
  'binance:positions': 5,
  'binance:account': 10,
  // OKX weights (request count)
  'okx:cancel': 1,
  'okx:order': 1,
  'okx:balance': 1,
  'okx:ticker': 1,
  'okx:klines': 1,
  'okx:positions': 1,
  // Bybit weights
  'bybit:cancel': 1,
  'bybit:order': 1,
  'bybit:balance': 1,
  'bybit:ticker': 1,
  'bybit:positions': 1,
  // Default
  'default': 1,
};

export function getWeight(exchange: ExchangeName, operation: string): number {
  return REQUEST_WEIGHTS[`${exchange}:${operation}`] || REQUEST_WEIGHTS['default'];
}

class RateLimitManager {
  private buckets: Map<ExchangeName, BucketState> = new Map();
  private cooldowns: Map<ExchangeName, CooldownState> = new Map();
  private queues: Map<ExchangeName, QueuedRequest<any>[]> = new Map();
  private timeOffsets: Map<ExchangeName, TimeOffset> = new Map();
  private processing: Map<ExchangeName, boolean> = new Map();
  private stats: Map<ExchangeName, { requests: number; blocked: number; retries: number }> = new Map();

  constructor() {
    this.initializeExchanges();
  }

  private initializeExchanges(): void {
    const exchanges: ExchangeName[] = ['binance', 'okx', 'bybit', 'kucoin', 'hyperliquid', 'nexo'];
    for (const exchange of exchanges) {
      const config = EXCHANGE_CONFIGS[exchange];
      this.buckets.set(exchange, {
        tokens: config.weightLimit,
        lastLeakTime: Date.now(),
        usedWeight: 0,
        weightLimit: config.weightLimit,
        ordersThisSecond: 0,
        lastOrderTime: Date.now(),
        requestsThisSecond: 0,
        lastRequestTime: Date.now(),
      });
      this.queues.set(exchange, []);
      this.timeOffsets.set(exchange, { offset: 0, lastSync: 0 });
      this.processing.set(exchange, false);
      this.stats.set(exchange, { requests: 0, blocked: 0, retries: 0 });
    }
  }

  // ============================================
  // LEAKY BUCKET ALGORITHM
  // ============================================
  private leakBucket(exchange: ExchangeName): void {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_CONFIGS[exchange];
    if (!bucket) return;

    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastLeakTime) / 1000;
    
    // Replenish tokens based on time elapsed
    const tokensToAdd = elapsedSeconds * (config.weightLimit / 60);
    bucket.tokens = Math.min(config.weightLimit, bucket.tokens + tokensToAdd);
    
    // Reset per-second counters if a second has passed
    if (now - bucket.lastOrderTime >= 1000) {
      bucket.ordersThisSecond = 0;
      bucket.lastOrderTime = now;
    }
    if (now - bucket.lastRequestTime >= 1000) {
      bucket.requestsThisSecond = 0;
      bucket.lastRequestTime = now;
    }
    
    bucket.lastLeakTime = now;
    this.buckets.set(exchange, bucket);
  }

  // ============================================
  // CAPACITY CHECKS
  // ============================================
  private canMakeRequest(exchange: ExchangeName, weight: number, isOrder: boolean = false): boolean {
    this.leakBucket(exchange);
    
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_CONFIGS[exchange];
    if (!bucket) return false;

    // Check cooldown
    if (this.isInCooldown(exchange)) {
      return false;
    }

    // Check token capacity
    if (bucket.tokens < weight) {
      return false;
    }

    // Check per-second request limit
    if (bucket.requestsThisSecond >= config.requestsPerSecond) {
      return false;
    }

    // Check order limit if this is an order
    if (isOrder && bucket.ordersThisSecond >= config.orderLimit) {
      return false;
    }

    // Check API-reported weight usage
    if (bucket.usedWeight > 0) {
      const usageRatio = bucket.usedWeight / bucket.weightLimit;
      if (usageRatio >= config.blockAt) {
        console.log(`[RateLimitManager] ${exchange}: BLOCKED - usage at ${(usageRatio * 100).toFixed(1)}%`);
        return false;
      }
    }

    return true;
  }

  private recordRequest(exchange: ExchangeName, weight: number, isOrder: boolean = false): void {
    const bucket = this.buckets.get(exchange);
    const stats = this.stats.get(exchange);
    if (!bucket) return;

    bucket.tokens = Math.max(0, bucket.tokens - weight);
    bucket.requestsThisSecond++;
    if (isOrder) {
      bucket.ordersThisSecond++;
    }
    
    this.buckets.set(exchange, bucket);
    
    if (stats) {
      stats.requests++;
      this.stats.set(exchange, stats);
    }
  }

  // ============================================
  // COOLDOWN / IP BAN MANAGEMENT
  // ============================================
  isInCooldown(exchange: ExchangeName): boolean {
    const cooldown = this.cooldowns.get(exchange);
    if (!cooldown) return false;
    
    if (Date.now() >= cooldown.until) {
      this.cooldowns.delete(exchange);
      console.log(`[RateLimitManager] ${exchange}: Cooldown expired`);
      return false;
    }
    return true;
  }

  getCooldownRemaining(exchange: ExchangeName): number {
    const cooldown = this.cooldowns.get(exchange);
    if (!cooldown) return 0;
    return Math.max(0, cooldown.until - Date.now());
  }

  private setCooldown(exchange: ExchangeName, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    this.cooldowns.set(exchange, { until, reason });
    console.log(`[RateLimitManager] ${exchange}: COOLDOWN for ${durationMs / 1000}s - ${reason}`);
  }

  private detectBan(exchange: ExchangeName, status: number, body: any): boolean {
    const signals = IP_BAN_SIGNALS[exchange];
    if (!signals) return false;

    // Check status code
    if (signals.codes.includes(status)) {
      this.setCooldown(exchange, signals.cooldownMs, `HTTP ${status}`);
      return true;
    }

    // Check error code in body
    const errorCode = body?.code || body?.retCode || body?.ret_code;
    if (errorCode && signals.codes.includes(String(errorCode))) {
      this.setCooldown(exchange, signals.cooldownMs, `Error code ${errorCode}`);
      return true;
    }

    // Check error messages
    const errorMsg = (body?.msg || body?.message || body?.retMsg || '').toLowerCase();
    if (signals.messages.some(msg => errorMsg.includes(msg))) {
      this.setCooldown(exchange, signals.cooldownMs, `Message: ${errorMsg}`);
      return true;
    }

    return false;
  }

  // ============================================
  // HEADER PARSING
  // ============================================
  parseRateLimitHeaders(exchange: ExchangeName, headers: Headers): void {
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_CONFIGS[exchange];
    if (!bucket || !config.usedWeightHeader) return;

    const getHeader = (name: string): string | null => {
      return headers.get(name) || headers.get(name.toLowerCase());
    };

    switch (exchange) {
      case 'binance': {
        const usedWeight = getHeader('x-mbx-used-weight-1m');
        if (usedWeight) {
          bucket.usedWeight = parseInt(usedWeight, 10);
          console.log(`[RateLimitManager] Binance weight: ${bucket.usedWeight}/${bucket.weightLimit}`);
        }
        break;
      }
      case 'okx': {
        const remaining = getHeader('x-ratelimit-remaining');
        const limit = getHeader('x-ratelimit-limit');
        if (remaining && limit) {
          bucket.weightLimit = parseInt(limit, 10);
          bucket.usedWeight = bucket.weightLimit - parseInt(remaining, 10);
        }
        break;
      }
      case 'bybit': {
        const status = getHeader('x-bapi-limit-status');
        const limit = getHeader('x-bapi-limit');
        if (status) bucket.usedWeight = parseInt(status, 10);
        if (limit) bucket.weightLimit = parseInt(limit, 10);
        break;
      }
      case 'kucoin': {
        const remaining = getHeader('gw-ratelimit-remaining');
        const limit = getHeader('gw-ratelimit-limit');
        if (remaining && limit) {
          bucket.weightLimit = parseInt(limit, 10);
          bucket.usedWeight = bucket.weightLimit - parseInt(remaining, 10);
        }
        break;
      }
    }

    this.buckets.set(exchange, bucket);
  }

  // ============================================
  // CLOCK SYNCHRONIZATION
  // ============================================
  async syncServerTime(exchange: ExchangeName): Promise<number> {
    const timeOffset = this.timeOffsets.get(exchange);
    const now = Date.now();
    
    // Only sync every 30 minutes
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
      console.log(`[RateLimitManager] ${exchange} clock sync: offset=${offset}ms`);
      return offset;
    } catch (error) {
      console.error(`[RateLimitManager] ${exchange} clock sync failed:`, error);
      return timeOffset?.offset || 0;
    }
  }

  getAdjustedTimestamp(exchange: ExchangeName): number {
    const offset = this.timeOffsets.get(exchange)?.offset || 0;
    return Date.now() + offset;
  }

  // ============================================
  // PRIORITY QUEUE MANAGEMENT
  // ============================================
  private async processQueue(exchange: ExchangeName): Promise<void> {
    if (this.processing.get(exchange)) return;
    this.processing.set(exchange, true);

    const queue = this.queues.get(exchange) || [];
    
    while (queue.length > 0) {
      // Sort by priority (lower = higher priority)
      queue.sort((a, b) => a.priority - b.priority);
      
      const request = queue[0];
      
      // Check if we can execute
      if (!this.canMakeRequest(exchange, request.weight, request.priority <= Priority.HIGH)) {
        // Wait and retry
        await this.sleep(100);
        continue;
      }

      // Remove from queue and execute
      queue.shift();
      this.queues.set(exchange, queue);
      
      try {
        this.recordRequest(exchange, request.weight, request.priority <= Priority.HIGH);
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing.set(exchange, false);
  }

  getQueueDepth(exchange: ExchangeName): { p0: number; p1: number; p2: number; total: number } {
    const queue = this.queues.get(exchange) || [];
    return {
      p0: queue.filter(r => r.priority === Priority.CRITICAL).length,
      p1: queue.filter(r => r.priority === Priority.HIGH).length,
      p2: queue.filter(r => r.priority === Priority.LOW).length,
      total: queue.length,
    };
  }

  // ============================================
  // MAIN EXECUTION WRAPPER
  // ============================================
  async execute<T>(
    exchange: ExchangeName,
    priority: Priority,
    weight: number,
    fn: () => Promise<Response>,
    options: { isOrder?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const { isOrder = priority <= Priority.HIGH, maxRetries = 5 } = options;
    
    // Check cooldown immediately for CRITICAL requests
    if (this.isInCooldown(exchange)) {
      const remaining = this.getCooldownRemaining(exchange);
      throw new Error(`Exchange ${exchange} in cooldown for ${Math.round(remaining / 1000)}s`);
    }

    // For CRITICAL priority, execute immediately if possible
    if (priority === Priority.CRITICAL && this.canMakeRequest(exchange, weight, isOrder)) {
      return this.executeWithRetry(exchange, weight, fn, isOrder, maxRetries);
    }

    // Queue the request
    return new Promise<T>((resolve, reject) => {
      const queue = this.queues.get(exchange) || [];
      queue.push({
        priority,
        weight,
        fn: async () => this.executeWithRetry(exchange, weight, fn, isOrder, maxRetries),
        resolve,
        reject,
        createdAt: Date.now(),
      });
      this.queues.set(exchange, queue);
      this.processQueue(exchange);
    });
  }

  private async executeWithRetry<T>(
    exchange: ExchangeName,
    weight: number,
    fn: () => Promise<Response>,
    isOrder: boolean,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | null = null;
    const stats = this.stats.get(exchange);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait for capacity
        while (!this.canMakeRequest(exchange, weight, isOrder)) {
          await this.sleep(100);
        }
        
        this.recordRequest(exchange, weight, isOrder);
        const response = await fn();
        
        // Parse rate limit headers
        this.parseRateLimitHeaders(exchange, response.headers);
        
        // Check for rate limit errors
        if (response.status === 429 || response.status === 418) {
          const body = await response.json().catch(() => ({}));
          this.detectBan(exchange, response.status, body);
          
          if (stats) {
            stats.retries++;
            this.stats.set(exchange, stats);
          }
          
          throw new Error(`Rate limit exceeded: ${response.status}`);
        }

        // Check for server errors
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        // Parse and check response body for ban signals
        const body = await response.json();
        
        if (this.detectBan(exchange, response.status, body)) {
          throw new Error(`IP ban detected`);
        }

        return body as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          if (stats) {
            stats.blocked++;
            this.stats.set(exchange, stats);
          }
          throw lastError;
        }

        // Exponential backoff with jitter
        const baseDelay = 2000;
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          32000
        );
        
        console.log(`[RateLimitManager] ${exchange}: Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
        await this.sleep(delay);
        
        if (stats) {
          stats.retries++;
          this.stats.set(exchange, stats);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  // ============================================
  // STATUS & MONITORING
  // ============================================
  getStatus(exchange: ExchangeName): {
    usagePercent: number;
    tokens: number;
    maxTokens: number;
    requestsThisSecond: number;
    ordersThisSecond: number;
    isThrottled: boolean;
    isCoolingDown: boolean;
    cooldownRemaining: number;
    queueDepth: { p0: number; p1: number; p2: number; total: number };
    stats: { requests: number; blocked: number; retries: number };
    clockOffset: number;
  } {
    this.leakBucket(exchange);
    
    const bucket = this.buckets.get(exchange);
    const config = EXCHANGE_CONFIGS[exchange];
    const stats = this.stats.get(exchange) || { requests: 0, blocked: 0, retries: 0 };
    const timeOffset = this.timeOffsets.get(exchange);

    if (!bucket) {
      return {
        usagePercent: 0,
        tokens: 0,
        maxTokens: 0,
        requestsThisSecond: 0,
        ordersThisSecond: 0,
        isThrottled: false,
        isCoolingDown: false,
        cooldownRemaining: 0,
        queueDepth: { p0: 0, p1: 0, p2: 0, total: 0 },
        stats,
        clockOffset: 0,
      };
    }

    const usagePercent = bucket.usedWeight > 0 
      ? (bucket.usedWeight / bucket.weightLimit) * 100
      : ((bucket.weightLimit - bucket.tokens) / bucket.weightLimit) * 100;

    return {
      usagePercent,
      tokens: Math.round(bucket.tokens),
      maxTokens: bucket.weightLimit,
      requestsThisSecond: bucket.requestsThisSecond,
      ordersThisSecond: bucket.ordersThisSecond,
      isThrottled: usagePercent >= config.throttleAt * 100,
      isCoolingDown: this.isInCooldown(exchange),
      cooldownRemaining: this.getCooldownRemaining(exchange),
      queueDepth: this.getQueueDepth(exchange),
      stats,
      clockOffset: timeOffset?.offset || 0,
    };
  }

  getAllStatus(): Record<ExchangeName, ReturnType<typeof this.getStatus>> {
    const result: Record<string, ReturnType<typeof this.getStatus>> = {};
    const exchanges: ExchangeName[] = ['binance', 'okx', 'bybit', 'kucoin', 'hyperliquid', 'nexo'];
    for (const exchange of exchanges) {
      result[exchange] = this.getStatus(exchange);
    }
    return result as Record<ExchangeName, ReturnType<typeof this.getStatus>>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const rateLimitManager = new RateLimitManager();

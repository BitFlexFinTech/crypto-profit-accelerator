// ============================================
// ENHANCED RETRY WITH EXPONENTIAL BACKOFF + JITTER
// For edge function API calls
// ============================================

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  retryableCodes?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 32000,
  jitterMs: 1000,
  retryableCodes: [429, 500, 502, 503, 504, 520, 521, 522, 523, 524],
};

/**
 * Enhanced retry with exponential backoff and jitter
 * Delays: 2s, 4s, 8s, 16s, 32s (with jitter)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Extract status code from various error formats
      const statusCode = 
        error?.status || 
        error?.statusCode || 
        error?.response?.status ||
        error?.code;
      
      // Check if error is retryable
      const isRetryable = 
        opts.retryableCodes.includes(statusCode) ||
        error?.message?.toLowerCase()?.includes('network') ||
        error?.message?.toLowerCase()?.includes('timeout') ||
        error?.message?.toLowerCase()?.includes('econnreset') ||
        error?.message?.toLowerCase()?.includes('econnrefused') ||
        error?.message?.toLowerCase()?.includes('socket hang up');

      if (!isRetryable || attempt === opts.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * opts.jitterMs;
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelayMs);

      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries} after ${Math.round(delay)}ms - ${lastError.message}`);
      
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wrapper for fetch with automatic retry
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(url, init);
    
    // Throw for retryable status codes
    if (response.status === 429 || response.status >= 500) {
      const error = new Error(`HTTP ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }
    
    return response;
  }, options);
}

/**
 * Check if an error indicates an IP ban
 */
export function isIpBanError(status: number, body: any): boolean {
  // HTTP 418 is the classic "IP banned" response
  if (status === 418) return true;
  
  // Check for specific exchange error codes
  const errorCode = String(body?.code || body?.retCode || body?.ret_code || '');
  const errorMsg = String(body?.msg || body?.message || body?.retMsg || '').toLowerCase();
  
  // Binance ban codes
  if (['-1003', '-1015', '-1021'].includes(errorCode)) return true;
  
  // OKX ban codes
  if (['50001', '50014'].includes(errorCode)) return true;
  
  // Bybit ban codes
  if (['10006', '10018'].includes(errorCode)) return true;
  
  // Message-based detection
  if (errorMsg.includes('banned') || errorMsg.includes('ip restricted')) return true;
  
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

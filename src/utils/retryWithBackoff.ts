// Exponential backoff retry utility for edge function calls

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitterMs?: number;
  retryableErrors?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 5,
  baseDelay: 2000,
  maxDelay: 32000,
  jitterMs: 1000,
  retryableErrors: [429, 500, 502, 503, 504, 520, 521, 522, 523, 524],
};

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
      lastError = error;
      
      // Check if error is retryable
      const statusCode = error?.status || error?.statusCode || error?.code;
      const isRetryable = opts.retryableErrors.includes(statusCode) || 
                          error?.message?.toLowerCase()?.includes('network') ||
                          error?.message?.toLowerCase()?.includes('timeout') ||
                          error?.message?.toLowerCase()?.includes('econnreset') ||
                          error?.message?.toLowerCase()?.includes('econnrefused');
      
      if (!isRetryable || attempt === opts.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = opts.baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * opts.jitterMs;
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelay);
      
      console.log(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries} after ${Math.round(delay)}ms`);
      
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delay);
      }
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wrapper for Supabase function invocations
export async function invokeWithRetry<T>(
  invoker: () => Promise<{ data: T | null; error: any }>,
  options?: RetryOptions
): Promise<T> {
  return retryWithBackoff(async () => {
    const { data, error } = await invoker();
    if (error) {
      throw error;
    }
    return data as T;
  }, options);
}

// Check if an error indicates an IP ban
export function isIpBanError(status: number, body: any): boolean {
  if (status === 418) return true;
  
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

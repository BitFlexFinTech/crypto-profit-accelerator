// Exponential backoff retry utility for edge function calls

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: [429, 500, 502, 503, 504],
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
                          error?.message?.includes('network') ||
                          error?.message?.includes('timeout') ||
                          error?.message?.includes('ECONNRESET');
      
      if (!isRetryable || attempt === opts.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        opts.maxDelay
      );
      
      console.log(`Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`);
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

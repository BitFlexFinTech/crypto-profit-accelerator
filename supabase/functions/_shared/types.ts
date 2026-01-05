// ============================================
// SHARED TYPES FOR EDGE FUNCTIONS
// ============================================

export type ExchangeName = 'binance' | 'okx' | 'bybit' | 'kucoin' | 'hyperliquid' | 'nexo';

export interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  executedPrice?: number;
  executedQty?: number;
  error?: string;
  errorCode?: string;
  errorType?: 'API_PERMISSION_ERROR' | 'INSUFFICIENT_BALANCE' | 'EXCHANGE_ERROR' | 'NETWORK_ERROR' | 'NO_CREDENTIALS' | 'RATE_LIMITED';
}

export interface BalanceCheckResult {
  hasBalance: boolean;
  available: number;
  required: number;
  error?: string;
}

export interface RateLimitStatus {
  exchange: ExchangeName;
  usagePercent: number;
  isThrottled: boolean;
  isCoolingDown: boolean;
  cooldownRemaining: number;
  queueDepth: number;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

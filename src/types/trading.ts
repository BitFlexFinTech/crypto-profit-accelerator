export type ExchangeName = 'binance' | 'okx' | 'nexo' | 'bybit' | 'kucoin' | 'hyperliquid';
export type TradeType = 'spot' | 'futures';
export type PositionDirection = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'cancelled';
export type NotificationType = 'trade_opened' | 'trade_closed' | 'profit_target_hit' | 'error' | 'warning' | 'info';

export interface BotSettings {
  id: string;
  user_id: string;
  is_paper_trading: boolean;
  is_bot_running: boolean;
  min_order_size: number;
  max_order_size: number;
  spot_profit_target: number;
  futures_profit_target: number;
  daily_loss_limit: number;
  max_open_positions: number;
  ai_aggressiveness: 'conservative' | 'balanced' | 'aggressive';
  created_at: string;
  updated_at: string;
}

export interface Exchange {
  id: string;
  user_id: string;
  exchange: ExchangeName;
  is_enabled: boolean;
  is_connected: boolean;
  spot_enabled: boolean;
  futures_enabled: boolean;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  passphrase_encrypted?: string;
  last_balance_sync?: string;
  created_at: string;
  updated_at: string;
}

export interface Balance {
  id: string;
  user_id: string;
  exchange_id: string;
  currency: string;
  available: number;
  locked: number;
  total: number;
  updated_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  exchange_id?: string;
  symbol: string;
  trade_type: TradeType;
  direction: PositionDirection;
  entry_price: number;
  exit_price?: number;
  quantity: number;
  order_size_usd: number;
  leverage: number;
  entry_fee: number;
  exit_fee: number;
  funding_fee: number;
  gross_profit?: number;
  net_profit?: number;
  status: PositionStatus;
  is_paper_trade: boolean;
  ai_score?: number;
  ai_reasoning?: string;
  opened_at: string;
  closed_at?: string;
  created_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  trade_id: string;
  exchange_id?: string;
  symbol: string;
  trade_type: TradeType;
  direction: PositionDirection;
  entry_price: number;
  current_price?: number;
  quantity: number;
  order_size_usd: number;
  leverage: number;
  unrealized_pnl: number;
  profit_target: number;
  status: PositionStatus;
  is_paper_trade: boolean;
  opened_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  is_read: boolean;
  trade_id?: string;
  created_at: string;
}

export interface DailyStats {
  id: string;
  user_id: string;
  date: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  gross_profit: number;
  total_fees: number;
  net_profit: number;
  open_price?: number;
  high_price?: number;
  low_price?: number;
  close_price?: number;
  created_at: string;
}

export interface SetupProgress {
  id: string;
  user_id: string;
  is_completed: boolean;
  current_step: number;
  exchanges_connected: string[];
  created_at: string;
  updated_at: string;
}

export interface ExchangeConfig {
  name: ExchangeName;
  displayName: string;
  logo: string;
  supportsFutures: boolean;
  supportsSpot: boolean;
  requiresPassphrase: boolean;
  apiDocsUrl: string;
}

export const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  {
    name: 'binance',
    displayName: 'Binance',
    logo: '🔶',
    supportsFutures: true,
    supportsSpot: true,
    requiresPassphrase: false,
    apiDocsUrl: 'https://www.binance.com/en/support/faq/how-to-create-api-360002502072',
  },
  {
    name: 'okx',
    displayName: 'OKX',
    logo: '⚫',
    supportsFutures: true,
    supportsSpot: true,
    requiresPassphrase: true,
    apiDocsUrl: 'https://www.okx.com/account/my-api',
  },
  {
    name: 'nexo',
    displayName: 'Nexo',
    logo: '🔵',
    supportsFutures: false,
    supportsSpot: true,
    requiresPassphrase: false,
    apiDocsUrl: 'https://nexo.com/api',
  },
  {
    name: 'bybit',
    displayName: 'ByBit',
    logo: '🟡',
    supportsFutures: true,
    supportsSpot: true,
    requiresPassphrase: false,
    apiDocsUrl: 'https://www.bybit.com/app/user/api-management',
  },
  {
    name: 'kucoin',
    displayName: 'KuCoin',
    logo: '🟢',
    supportsFutures: true,
    supportsSpot: true,
    requiresPassphrase: true,
    apiDocsUrl: 'https://www.kucoin.com/account/api',
  },
  {
    name: 'hyperliquid',
    displayName: 'Hyperliquid',
    logo: '💜',
    supportsFutures: true,
    supportsSpot: false,
    requiresPassphrase: false,
    apiDocsUrl: 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api',
  },
];

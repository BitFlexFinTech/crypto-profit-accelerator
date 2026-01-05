// Dynamic Region Mapping Service for Proximity-Optimized VPS Deployment
// Selects optimal cloud regions based on connected exchanges for minimal latency

export type CloudProvider = 'digitalocean' | 'aws' | 'oracle' | 'gcp';
export type ExchangeKey = 'binance' | 'okx' | 'bybit' | 'coinbase' | 'kraken' | 'kucoin' | 'nexo' | 'hyperliquid';

export interface RegionConfig {
  code: string;
  city: string;
  country: string;
  flag: string;
  latencyEstimate: string;
}

interface ProviderRegions {
  aws: string;
  digitalocean: string;
  oracle: string;
  gcp: string;
}

interface ExchangeRegionMapping {
  regions: ProviderRegions;
  city: string;
  country: string;
  flag: string;
  latency: string;
  priority: number; // Higher = more important (based on volume)
}

// Exchange-to-Region proximity mappings with priority based on trading volume
const EXCHANGE_REGIONS: Record<ExchangeKey, ExchangeRegionMapping> = {
  binance: {
    regions: { aws: 'ap-northeast-1', digitalocean: 'sgp1', oracle: 'ap-tokyo-1', gcp: 'asia-northeast1' },
    city: 'Tokyo',
    country: 'Japan',
    flag: '🇯🇵',
    latency: '~10ms',
    priority: 100
  },
  okx: {
    regions: { aws: 'ap-northeast-1', digitalocean: 'sgp1', oracle: 'ap-tokyo-1', gcp: 'asia-northeast1' },
    city: 'Tokyo',
    country: 'Japan',
    flag: '🇯🇵',
    latency: '~15ms',
    priority: 90
  },
  bybit: {
    regions: { aws: 'ap-southeast-1', digitalocean: 'sgp1', oracle: 'ap-singapore-1', gcp: 'asia-southeast1' },
    city: 'Singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    latency: '~20ms',
    priority: 80
  },
  kucoin: {
    regions: { aws: 'ap-southeast-1', digitalocean: 'sgp1', oracle: 'ap-singapore-1', gcp: 'asia-southeast1' },
    city: 'Singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    latency: '~25ms',
    priority: 60
  },
  hyperliquid: {
    regions: { aws: 'us-east-1', digitalocean: 'nyc1', oracle: 'us-ashburn-1', gcp: 'us-east1' },
    city: 'Virginia',
    country: 'USA',
    flag: '🇺🇸',
    latency: '~5ms',
    priority: 70
  },
  coinbase: {
    regions: { aws: 'us-east-1', digitalocean: 'nyc1', oracle: 'us-ashburn-1', gcp: 'us-east1' },
    city: 'Virginia',
    country: 'USA',
    flag: '🇺🇸',
    latency: '~5ms',
    priority: 75
  },
  kraken: {
    regions: { aws: 'eu-west-1', digitalocean: 'ams3', oracle: 'eu-frankfurt-1', gcp: 'europe-west1' },
    city: 'Ireland',
    country: 'Ireland',
    flag: '🇮🇪',
    latency: '~10ms',
    priority: 65
  },
  nexo: {
    regions: { aws: 'eu-west-1', digitalocean: 'ams3', oracle: 'eu-frankfurt-1', gcp: 'europe-west1' },
    city: 'Frankfurt',
    country: 'Germany',
    flag: '🇩🇪',
    latency: '~15ms',
    priority: 40
  }
};

// Provider-specific region display names
const REGION_DISPLAY_NAMES: Record<CloudProvider, Record<string, string>> = {
  aws: {
    'ap-northeast-1': 'Tokyo (ap-northeast-1)',
    'ap-southeast-1': 'Singapore (ap-southeast-1)',
    'us-east-1': 'N. Virginia (us-east-1)',
    'eu-west-1': 'Ireland (eu-west-1)'
  },
  digitalocean: {
    'sgp1': 'Singapore (sgp1)',
    'nyc1': 'New York (nyc1)',
    'ams3': 'Amsterdam (ams3)'
  },
  oracle: {
    'ap-tokyo-1': 'Tokyo (ap-tokyo-1)',
    'ap-singapore-1': 'Singapore (ap-singapore-1)',
    'us-ashburn-1': 'Ashburn (us-ashburn-1)',
    'eu-frankfurt-1': 'Frankfurt (eu-frankfurt-1)'
  },
  gcp: {
    'asia-northeast1': 'Tokyo (asia-northeast1)',
    'asia-southeast1': 'Singapore (asia-southeast1)',
    'us-east1': 'South Carolina (us-east1)',
    'europe-west1': 'Belgium (europe-west1)'
  }
};

// Monthly cost estimates per provider (USD)
export const PROVIDER_COSTS: Record<CloudProvider, { monthly: number; specs: string }> = {
  digitalocean: { monthly: 24, specs: '2 vCPU, 4GB RAM, 80GB SSD' },
  aws: { monthly: 35, specs: 't3.medium - 2 vCPU, 4GB RAM' },
  oracle: { monthly: 0, specs: 'Always Free - 1 vCPU, 1GB RAM' },
  gcp: { monthly: 25, specs: 'e2-medium - 2 vCPU, 4GB RAM' }
};

/**
 * Get the optimal region for VPS deployment based on connected exchanges
 * Priority: Binance/OKX (Tokyo) > Bybit (Singapore) > Coinbase (US-East) > Kraken (Ireland)
 */
export function get_optimal_region(
  connectedExchanges: string[],
  provider: CloudProvider
): RegionConfig {
  // Filter to known exchanges and sort by priority
  const knownExchanges = connectedExchanges
    .filter((e): e is ExchangeKey => e in EXCHANGE_REGIONS)
    .sort((a, b) => EXCHANGE_REGIONS[b].priority - EXCHANGE_REGIONS[a].priority);

  // Default to Tokyo (Binance region) if no exchanges connected
  if (knownExchanges.length === 0) {
    const defaultMapping = EXCHANGE_REGIONS.binance;
    return {
      code: defaultMapping.regions[provider],
      city: defaultMapping.city,
      country: defaultMapping.country,
      flag: defaultMapping.flag,
      latencyEstimate: defaultMapping.latency
    };
  }

  // Use highest priority exchange for region selection
  const primaryExchange = knownExchanges[0];
  const mapping = EXCHANGE_REGIONS[primaryExchange];

  return {
    code: mapping.regions[provider],
    city: mapping.city,
    country: mapping.country,
    flag: mapping.flag,
    latencyEstimate: mapping.latency
  };
}

/**
 * Get display-friendly region information
 */
export function getRegionDisplayName(regionCode: string, provider: CloudProvider): string {
  return REGION_DISPLAY_NAMES[provider]?.[regionCode] || regionCode;
}

/**
 * Get all available regions for a provider
 */
export function getProviderRegions(provider: CloudProvider): Array<{ code: string; name: string }> {
  const regions = REGION_DISPLAY_NAMES[provider];
  return Object.entries(regions).map(([code, name]) => ({ code, name }));
}

/**
 * Determine which exchanges influenced region selection
 */
export function getRegionExchanges(connectedExchanges: string[], region: string): string[] {
  return connectedExchanges.filter((exchange) => {
    const mapping = EXCHANGE_REGIONS[exchange as ExchangeKey];
    if (!mapping) return false;
    return Object.values(mapping.regions).includes(region);
  });
}

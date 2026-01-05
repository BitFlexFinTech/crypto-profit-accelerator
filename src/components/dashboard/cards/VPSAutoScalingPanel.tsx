import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useVPSScalingRules } from '@/hooks/useVPSScalingRules';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { Zap, Clock, Server, TrendingUp, AlertTriangle, DollarSign, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';

const PROVIDERS = [
  { value: 'digitalocean', label: 'DigitalOcean', cost: 6 },
  { value: 'aws', label: 'AWS Lightsail', cost: 5 },
  { value: 'oracle', label: 'Oracle Cloud', cost: 0 },
  { value: 'gcp', label: 'Google Cloud', cost: 7 },
];

const REGIONS = [
  { value: 'nyc1', label: 'New York' },
  { value: 'sfo3', label: 'San Francisco' },
  { value: 'lon1', label: 'London' },
  { value: 'sgp1', label: 'Singapore' },
  { value: 'fra1', label: 'Frankfurt' },
];

export function VPSAutoScalingPanel() {
  const { rule, loading, createOrUpdateRule } = useVPSScalingRules();
  const { deployments } = useVPSDeployments();

  // Simulated current market volatility (in production, this would come from real data)
  const currentVolatility = useMemo(() => {
    return 2.4 + Math.random() * 2;
  }, []);

  const activeInstances = deployments.filter(d => d.status === 'running').length;

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isEnabled = rule?.is_enabled ?? false;
  const volatilityThreshold = rule?.volatility_threshold ?? 3;
  const maxInstances = rule?.max_instances ?? 3;
  const cooldownMinutes = rule?.cooldown_minutes ?? 30;
  const provider = rule?.provider ?? 'digitalocean';
  const region = rule?.region ?? 'nyc1';
  const lastScaleAt = rule?.last_scale_at;
  const scaleUpCount = rule?.scale_up_count ?? 0;

  const providerCost = PROVIDERS.find(p => p.value === provider)?.cost ?? 6;
  const estimatedMonthlyCost = maxInstances * providerCost;

  const volatilityPercent = Math.min((currentVolatility / 10) * 100, 100);
  const thresholdPercent = (volatilityThreshold / 10) * 100;
  const isNearThreshold = currentVolatility >= volatilityThreshold * 0.8;
  const isAboveThreshold = currentVolatility >= volatilityThreshold;

  const handleToggle = async (enabled: boolean) => {
    await createOrUpdateRule({ is_enabled: enabled });
  };

  const handleVolatilityChange = async (value: number[]) => {
    await createOrUpdateRule({ volatility_threshold: value[0] });
  };

  const handleMaxInstancesChange = async (value: number[]) => {
    await createOrUpdateRule({ max_instances: value[0] });
  };

  const handleCooldownChange = async (value: number[]) => {
    await createOrUpdateRule({ cooldown_minutes: value[0] });
  };

  const handleProviderChange = async (value: string) => {
    await createOrUpdateRule({ provider: value });
  };

  const handleRegionChange = async (value: string) => {
    await createOrUpdateRule({ region: value });
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-yellow-500" />
            VPS Auto-Scaling
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isEnabled ? 'default' : 'secondary'} className="text-xs">
              {isEnabled ? 'Active' : 'Disabled'}
            </Badge>
            <Switch checked={isEnabled} onCheckedChange={handleToggle} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live Market Volatility Gauge */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              Current Market Volatility
            </Label>
            <span className={`text-sm font-mono font-bold ${
              isAboveThreshold ? 'text-red-400' : isNearThreshold ? 'text-yellow-400' : 'text-emerald-400'
            }`}>
              {currentVolatility.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            {/* Volatility bar */}
            <div 
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                isAboveThreshold ? 'bg-red-500' : isNearThreshold ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${volatilityPercent}%` }}
            />
            {/* Threshold marker */}
            <div 
              className="absolute top-0 w-0.5 h-full bg-foreground/70"
              style={{ left: `${thresholdPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span className="flex items-center gap-1">
              {isAboveThreshold && <AlertTriangle className="h-2.5 w-2.5 text-red-400" />}
              Threshold: {volatilityThreshold}%
            </span>
            <span>10%</span>
          </div>
        </div>

        {/* Instance Status */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{activeInstances}</div>
            <div className="text-[10px] text-muted-foreground">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{maxInstances}</div>
            <div className="text-[10px] text-muted-foreground">Max</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{scaleUpCount}</div>
            <div className="text-[10px] text-muted-foreground">Scale Events</div>
          </div>
        </div>

        {/* Volatility Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Volatility Threshold
            </Label>
            <span className="text-sm font-mono text-foreground">{volatilityThreshold}%</span>
          </div>
          <Slider
            value={[volatilityThreshold]}
            onValueCommit={handleVolatilityChange}
            min={1}
            max={10}
            step={0.5}
            disabled={!isEnabled}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Scale up when 15-min price change exceeds this threshold
          </p>
        </div>

        {/* Max Instances */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Server className="h-3 w-3" />
              Max Instances
            </Label>
            <span className="text-sm font-mono text-foreground">{maxInstances}</span>
          </div>
          <Slider
            value={[maxInstances]}
            onValueCommit={handleMaxInstancesChange}
            min={1}
            max={5}
            step={1}
            disabled={!isEnabled}
            className="w-full"
          />
        </div>

        {/* Cooldown Period */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Cooldown Period
            </Label>
            <span className="text-sm font-mono text-foreground">{cooldownMinutes} min</span>
          </div>
          <Slider
            value={[cooldownMinutes]}
            onValueCommit={handleCooldownChange}
            min={15}
            max={120}
            step={15}
            disabled={!isEnabled}
            className="w-full"
          />
        </div>

        {/* Provider & Region */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange} disabled={!isEnabled}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label} {p.cost === 0 ? '(Free)' : `($${p.cost}/mo)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Region</Label>
            <Select value={region} onValueChange={handleRegionChange} disabled={!isEnabled}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cost Projection */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Est. Max Monthly Cost
            </Label>
            <span className="text-sm font-bold text-foreground">
              {estimatedMonthlyCost === 0 ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">FREE</Badge>
              ) : (
                `$${estimatedMonthlyCost}/mo`
              )}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Based on {maxInstances} instance{maxInstances > 1 ? 's' : ''} × ${providerCost}/mo
          </p>
        </div>

        {/* Last Scale Event */}
        {lastScaleAt && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Last scale event:{' '}
              <span className="text-foreground">
                {formatDistanceToNow(new Date(lastScaleAt), { addSuffix: true })}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

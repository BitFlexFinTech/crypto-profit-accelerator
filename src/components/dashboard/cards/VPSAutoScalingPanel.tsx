import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useVPSScalingRules } from '@/hooks/useVPSScalingRules';
import { Zap, Clock, Server, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const PROVIDERS = [
  { value: 'digitalocean', label: 'DigitalOcean' },
  { value: 'aws', label: 'AWS Lightsail' },
  { value: 'oracle', label: 'Oracle Cloud' },
  { value: 'gcp', label: 'Google Cloud' },
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
                    {p.label}
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

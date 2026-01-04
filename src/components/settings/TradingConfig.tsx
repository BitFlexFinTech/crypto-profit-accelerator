import { useBotSettings } from '@/hooks/useBotSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export function TradingConfig() {
  const { settings, loading, updateSettings } = useBotSettings();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Trading Configuration</h2>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Order Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Order Size Range (USD)</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  value={settings.min_order_size}
                  onChange={(e) => updateSettings({ min_order_size: Number(e.target.value) })}
                  className="bg-secondary border-border w-24 text-center"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="number"
                  value={settings.max_order_size}
                  onChange={(e) => updateSettings({ max_order_size: Number(e.target.value) })}
                  className="bg-secondary border-border w-24 text-center"
                />
              </div>
              <p className="text-xs text-muted-foreground">Min $333, Max $450 recommended</p>
            </div>

            <div className="space-y-2">
              <Label>Spot Profit Target (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={settings.spot_profit_target}
                onChange={(e) => updateSettings({ spot_profit_target: Number(e.target.value) })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Futures Profit Target (USD)</Label>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary border border-primary/30">
                  Default: $3
                </span>
              </div>
              <Input
                type="number"
                step="0.01"
                min="3"
                value={settings.futures_profit_target}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  // Enforce minimum $3 for futures
                  updateSettings({ futures_profit_target: Math.max(3, value) });
                }}
                className="bg-secondary border-border"
              />
              {settings.futures_profit_target < 3 && (
                <p className="text-xs text-destructive">
                  ⚠️ Minimum $3 required for futures trades (after all fees)
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Strict rule: Bot closes leverage trades at $3 net profit (after all fees)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Risk Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Daily Loss Limit (USD)</Label>
              <Input
                type="number"
                value={settings.daily_loss_limit}
                onChange={(e) => updateSettings({ daily_loss_limit: Number(e.target.value) })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Max Open Positions</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[settings.max_open_positions]}
                  onValueChange={([value]) => updateSettings({ max_open_positions: value })}
                  max={20}
                  min={1}
                  step={1}
                  className="flex-1"
                />
                <span className="font-mono text-foreground w-8">{settings.max_open_positions}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>AI Aggressiveness</Label>
              <Select
                value={settings.ai_aggressiveness}
                onValueChange={(value) => updateSettings({ ai_aggressiveness: value as 'conservative' | 'balanced' | 'aggressive' })}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.ai_aggressiveness === 'conservative' && 'Lower risk, fewer trades, higher probability'}
                {settings.ai_aggressiveness === 'balanced' && 'Balanced approach between risk and opportunity'}
                {settings.ai_aggressiveness === 'aggressive' && 'Higher risk, more trades, faster execution'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Trading Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Paper Trading Mode</Label>
              <p className="text-sm text-muted-foreground">
                {settings.is_paper_trading 
                  ? 'Bot will simulate trades without using real money'
                  : 'Bot will execute real trades with your funds'}
              </p>
            </div>
            <Switch
              checked={settings.is_paper_trading}
              onCheckedChange={(checked) => updateSettings({ is_paper_trading: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

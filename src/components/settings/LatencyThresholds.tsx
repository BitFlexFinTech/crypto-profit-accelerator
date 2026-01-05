import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useBotSettings } from '@/hooks/useBotSettings';
import { wsManager } from '@/services/ExchangeWebSocketManager';
import { hftCore } from '@/services/HFTCore';
import { AlertTriangle, Wifi, WifiOff, Zap } from 'lucide-react';

interface ExchangeLatency {
  connected: boolean;
  latency: number;
  lastRttAt: number;
}

const EXCHANGES = [
  { key: 'binance', name: 'Binance', icon: '🔶' },
  { key: 'okx', name: 'OKX', icon: '⚫' },
  { key: 'bybit', name: 'Bybit', icon: '🟡' },
] as const;

export function LatencyThresholds() {
  const { settings, updateSettings, loading } = useBotSettings();
  const [liveLatencies, setLiveLatencies] = useState<Record<string, ExchangeLatency>>({});

  // Update live latencies from WebSocket manager
  useEffect(() => {
    const updateLatencies = () => {
      const status = wsManager.getConnectionStatus();
      const latencies: Record<string, ExchangeLatency> = {};
      
      EXCHANGES.forEach(({ key }) => {
        const conn = status[key];
        latencies[key] = {
          connected: conn?.connected ?? false,
          latency: conn?.latency ?? 0,
          lastRttAt: (conn as { lastRttAt?: number })?.lastRttAt ?? 0,
        };
      });
      
      setLiveLatencies(latencies);
    };

    updateLatencies();
    const interval = setInterval(updateLatencies, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync settings to HFTCore when they change
  useEffect(() => {
    if (!settings) return;
    
    hftCore.updateLatencyThresholds({
      binance: { 
        enter: settings.latency_threshold_binance, 
        exit: settings.latency_exit_threshold_binance 
      },
      okx: { 
        enter: settings.latency_threshold_okx, 
        exit: settings.latency_exit_threshold_okx 
      },
      bybit: { 
        enter: settings.latency_threshold_bybit, 
        exit: settings.latency_exit_threshold_bybit 
      },
      enabled: settings.safe_mode_enabled,
    });
  }, [settings]);

  const handleToggleSafeMode = async (enabled: boolean) => {
    await updateSettings({ safe_mode_enabled: enabled });
  };

  const handleThresholdChange = async (
    exchange: string, 
    type: 'enter' | 'exit', 
    value: number
  ) => {
    const key = type === 'enter' 
      ? `latency_threshold_${exchange}` 
      : `latency_exit_threshold_${exchange}`;
    await updateSettings({ [key]: value } as Partial<typeof settings>);
  };

  const getLatencyStatus = (exchange: string) => {
    const live = liveLatencies[exchange];
    if (!live?.connected) return 'disconnected';
    
    const enterThreshold = settings?.[`latency_threshold_${exchange}` as keyof typeof settings] as number ?? 1200;
    const exitThreshold = settings?.[`latency_exit_threshold_${exchange}` as keyof typeof settings] as number ?? 800;
    
    if (live.latency === 0) return 'no-data';
    if (live.latency > enterThreshold) return 'danger';
    if (live.latency > exitThreshold) return 'warning';
    return 'healthy';
  };

  if (loading || !settings) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Safe Mode Latency Thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Safe Mode Latency Thresholds
            </CardTitle>
            <CardDescription className="mt-1">
              Configure when Safe Mode activates based on exchange WebSocket latency
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="safe-mode-toggle" className="text-sm text-muted-foreground">
              Safe Mode
            </Label>
            <Switch
              id="safe-mode-toggle"
              checked={settings.safe_mode_enabled}
              onCheckedChange={handleToggleSafeMode}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!settings.safe_mode_enabled && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-yellow-500">
              Safe Mode is disabled. The bot will not pause trading during high latency.
            </span>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {EXCHANGES.map(({ key, name, icon }) => {
            const live = liveLatencies[key];
            const status = getLatencyStatus(key);
            const enterThreshold = settings[`latency_threshold_${key}` as keyof typeof settings] as number;
            const exitThreshold = settings[`latency_exit_threshold_${key}` as keyof typeof settings] as number;
            
            return (
              <div
                key={key}
                className={`p-4 rounded-lg border transition-colors ${
                  !settings.safe_mode_enabled 
                    ? 'bg-muted/30 border-border opacity-60' 
                    : 'bg-muted/50 border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <span className="font-medium text-foreground">{name}</span>
                  </div>
                  
                  {live?.connected ? (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        status === 'healthy' ? 'border-green-500 text-green-500' :
                        status === 'warning' ? 'border-yellow-500 text-yellow-500' :
                        status === 'danger' ? 'border-red-500 text-red-500' :
                        'border-muted-foreground text-muted-foreground'
                      }`}
                    >
                      <Wifi className="h-3 w-3 mr-1" />
                      {live.latency > 0 ? `${live.latency}ms` : '--'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border-muted-foreground text-muted-foreground">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Offline
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Enter Safe Mode</Label>
                      <span className="text-xs font-mono text-foreground">{enterThreshold}ms</span>
                    </div>
                    <Slider
                      value={[enterThreshold]}
                      onValueChange={([v]) => handleThresholdChange(key, 'enter', v)}
                      min={200}
                      max={3000}
                      step={100}
                      disabled={!settings.safe_mode_enabled}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>200ms</span>
                      <span>3000ms</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Exit Safe Mode</Label>
                      <span className="text-xs font-mono text-foreground">{exitThreshold}ms</span>
                    </div>
                    <Slider
                      value={[exitThreshold]}
                      onValueChange={([v]) => handleThresholdChange(key, 'exit', v)}
                      min={100}
                      max={2000}
                      step={100}
                      disabled={!settings.safe_mode_enabled}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>100ms</span>
                      <span>2000ms</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground">
          Safe Mode pauses trading when exchange WebSocket latency exceeds the enter threshold. 
          Trading resumes when latency drops below the exit threshold for 3 consecutive checks.
        </p>
      </CardContent>
    </Card>
  );
}

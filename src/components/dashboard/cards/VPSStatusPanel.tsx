import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Wifi, WifiOff, Clock, MapPin, DollarSign, Activity, AlertCircle } from 'lucide-react';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { cn } from '@/lib/utils';

const PROVIDER_ICONS: Record<string, string> = {
  digitalocean: '🌊',
  aws: '☁️',
  oracle: '🔴',
  gcp: '🔵',
};

const PROVIDER_COLORS: Record<string, string> = {
  digitalocean: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  aws: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  oracle: 'bg-red-500/20 text-red-400 border-red-500/30',
  gcp: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
};

export function VPSStatusPanel() {
  const { deployments, loading, getHeartbeatStatus, getSecondsSinceHeartbeat } = useVPSDeployments();

  if (loading) {
    return (
      <Card className="h-full bg-card border-border">
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-2">
          <Skeleton className="h-16 mb-2" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  const runningCount = deployments.filter(d => d.status === 'running').length;
  const connectedCount = deployments.filter(d => d.websocket_connected).length;

  return (
    <Card className="h-full bg-card border-border overflow-hidden flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between flex-shrink-0 py-2 px-3">
        <div>
          <CardTitle className="text-xs text-foreground flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-primary" />
            VPS Instances
          </CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {runningCount} running • {connectedCount} connected
          </p>
        </div>
        {deployments.length > 0 && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">
            <Activity className="h-2.5 w-2.5 mr-1" />
            Live
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 min-h-0">
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-6 text-muted-foreground">
            <Server className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No VPS instances deployed</p>
            <p className="text-[10px] mt-1">Deploy via Settings → VPS</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-1.5 p-2">
              {deployments.map((deployment) => {
                const heartbeatStatus = getHeartbeatStatus(deployment);
                const secondsAgo = getSecondsSinceHeartbeat(deployment);
                const isConnected = deployment.websocket_connected;
                
                return (
                  <div
                    key={deployment.id}
                    className={cn(
                      "p-2 rounded-lg bg-secondary/50 border border-border/50",
                      deployment.status === 'error' && "border-destructive/50 bg-destructive/10"
                    )}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{PROVIDER_ICONS[deployment.provider] || '🖥️'}</span>
                        <Badge 
                          variant="outline" 
                          className={cn("text-[8px] px-1 py-0", PROVIDER_COLORS[deployment.provider])}
                        >
                          {deployment.provider.toUpperCase()}
                        </Badge>
                        <Badge
                          variant={deployment.status === 'running' ? 'default' : 'secondary'}
                          className="text-[8px] px-1 py-0"
                        >
                          {deployment.status || 'pending'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {isConnected ? (
                          <Wifi className="h-3 w-3 text-primary" />
                        ) : (
                          <WifiOff className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "text-[9px] font-medium",
                          isConnected ? "text-primary" : "text-muted-foreground"
                        )}>
                          {isConnected ? 'WS Connected' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" />
                        <span>{deployment.region_city || deployment.region}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="h-2.5 w-2.5" />
                        <span>${deployment.monthly_cost_estimate || 0}/mo</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        <span className={cn(
                          heartbeatStatus === 'healthy' && "text-primary",
                          heartbeatStatus === 'warning' && "text-yellow-500",
                          heartbeatStatus === 'stale' && "text-orange-500",
                          heartbeatStatus === 'offline' && "text-destructive",
                        )}>
                          {secondsAgo === Infinity ? 'No heartbeat' : `${secondsAgo}s ago`}
                        </span>
                      </div>
                      {deployment.ip_address && (
                        <div className="text-muted-foreground font-mono truncate">
                          {deployment.ip_address}
                        </div>
                      )}
                    </div>

                    {/* Error Message */}
                    {deployment.error_message && (
                      <div className="mt-1.5 flex items-start gap-1 text-[9px] text-destructive">
                        <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{deployment.error_message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

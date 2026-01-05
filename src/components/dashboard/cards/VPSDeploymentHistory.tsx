import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { History, Server, Clock, DollarSign, Activity } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  terminated: 'bg-muted text-muted-foreground border-muted',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  stopped: 'bg-muted text-muted-foreground border-muted',
};

export function VPSDeploymentHistory() {
  const { deployments, loading } = useVPSDeployments();

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calculate summary stats
  const totalDeployments = deployments.length;
  const activeDeployments = deployments.filter(d => d.status === 'running').length;
  const totalCost = deployments.reduce((sum, d) => sum + (d.total_cost_incurred || 0), 0);
  const totalTrades = deployments.reduce((sum, d) => sum + (d.total_trades_executed || 0), 0);
  const avgUptime = deployments.length > 0
    ? deployments.reduce((sum, d) => sum + (d.total_uptime_seconds || 0), 0) / deployments.length
    : 0;

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-blue-400" />
          Deployment History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{totalDeployments}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-emerald-400">{activeDeployments}</div>
            <div className="text-[10px] text-muted-foreground">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">${totalCost.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">Cost</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{totalTrades}</div>
            <div className="text-[10px] text-muted-foreground">Trades</div>
          </div>
        </div>

        {/* Deployments List */}
        {deployments.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No deployments yet
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {deployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        {deployment.provider}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {deployment.region_city || deployment.region}
                      </span>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] ${STATUS_COLORS[deployment.status || 'pending']}`}
                    >
                      {deployment.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      <span>
                        {deployment.created_at
                          ? formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Activity className="h-2.5 w-2.5" />
                      <span>
                        {formatUptime(deployment.total_uptime_seconds || 0)} uptime
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="h-2.5 w-2.5" />
                      <span>
                        ${(deployment.total_cost_incurred || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {deployment.terminated_at && (
                    <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                      Terminated: {format(new Date(deployment.terminated_at), 'MMM d, HH:mm')}
                      {deployment.termination_reason && (
                        <span className="ml-1">({deployment.termination_reason})</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Average Uptime */}
        {deployments.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Average uptime: <span className="text-foreground">{formatUptime(avgUptime)}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

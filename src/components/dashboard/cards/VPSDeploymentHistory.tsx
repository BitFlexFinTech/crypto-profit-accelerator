import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { History, Server, Clock, DollarSign, Activity, TrendingUp, Zap, BarChart3 } from 'lucide-react';
import { formatDistanceToNow, format, differenceInHours } from 'date-fns';
import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  terminated: 'bg-muted text-muted-foreground border-muted',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  stopped: 'bg-muted text-muted-foreground border-muted',
};

const PROVIDER_COLORS: Record<string, string> = {
  digitalocean: 'hsl(var(--chart-1))',
  aws: 'hsl(var(--chart-2))',
  oracle: 'hsl(var(--chart-3))',
  gcp: 'hsl(var(--chart-4))',
};

export function VPSDeploymentHistory() {
  const { deployments, loading } = useVPSDeployments();
  const [filter, setFilter] = useState<'all' | 'running' | 'terminated'>('all');

  const filteredDeployments = useMemo(() => {
    if (filter === 'all') return deployments;
    if (filter === 'running') return deployments.filter(d => d.status === 'running');
    return deployments.filter(d => d.status === 'terminated' || d.status === 'stopped');
  }, [deployments, filter]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = deployments.length;
    const active = deployments.filter(d => d.status === 'running').length;
    const totalCost = deployments.reduce((sum, d) => sum + (d.total_cost_incurred || 0), 0);
    const totalTrades = deployments.reduce((sum, d) => sum + (d.total_trades_executed || 0), 0);
    const totalUptimeSeconds = deployments.reduce((sum, d) => sum + (d.total_uptime_seconds || 0), 0);
    const avgUptime = total > 0 ? totalUptimeSeconds / total : 0;
    
    // Cost by provider
    const costByProvider = deployments.reduce((acc, d) => {
      const provider = d.provider || 'unknown';
      acc[provider] = (acc[provider] || 0) + (d.total_cost_incurred || 0);
      return acc;
    }, {} as Record<string, number>);

    // Uptime percentage (assuming target is 99.9%)
    const totalHours = deployments.reduce((sum, d) => {
      if (!d.created_at) return sum;
      const start = new Date(d.created_at);
      const end = d.terminated_at ? new Date(d.terminated_at) : new Date();
      return sum + differenceInHours(end, start);
    }, 0);
    const expectedHours = totalHours;
    const actualHours = totalUptimeSeconds / 3600;
    const uptimePercentage = expectedHours > 0 ? Math.min((actualHours / expectedHours) * 100, 100) : 0;

    return { total, active, totalCost, totalTrades, avgUptime, costByProvider, uptimePercentage };
  }, [deployments]);

  const costChartData = useMemo(() => {
    return Object.entries(stats.costByProvider).map(([provider, cost]) => ({
      name: provider,
      value: cost,
      color: PROVIDER_COLORS[provider] || 'hsl(var(--muted))',
    }));
  }, [stats.costByProvider]);

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

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4 text-blue-400" />
            Deployment History
          </CardTitle>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All</SelectItem>
              <SelectItem value="running" className="text-xs">Active</SelectItem>
              <SelectItem value="terminated" className="text-xs">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats with Cost Chart */}
        <div className="grid grid-cols-5 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{stats.total}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-emerald-400">{stats.active}</div>
            <div className="text-[10px] text-muted-foreground">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">${stats.totalCost.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">Cost</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{stats.totalTrades}</div>
            <div className="text-[10px] text-muted-foreground">Trades</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold text-foreground">{stats.uptimePercentage.toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">Uptime</div>
          </div>
        </div>

        {/* Cost Breakdown Mini Chart */}
        {costChartData.length > 0 && stats.totalCost > 0 && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={15}
                      outerRadius={28}
                      paddingAngle={2}
                    >
                      {costChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '10px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BarChart3 className="h-3 w-3" />
                  Cost by Provider
                </Label>
                <div className="flex flex-wrap gap-2">
                  {costChartData.map((item) => (
                    <div key={item.name} className="flex items-center gap-1 text-[10px]">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground capitalize">{item.name}:</span>
                      <span className="text-foreground">${item.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Deployments List */}
        {filteredDeployments.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No deployments {filter !== 'all' ? `with status "${filter}"` : 'yet'}
          </div>
        ) : (
          <ScrollArea className="h-[180px]">
            <div className="space-y-2">
              {filteredDeployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground capitalize">
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

                  <div className="grid grid-cols-4 gap-2 text-[10px]">
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
                        {formatUptime(deployment.total_uptime_seconds || 0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="h-2.5 w-2.5" />
                      <span>
                        ${(deployment.total_cost_incurred || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Zap className="h-2.5 w-2.5" />
                      <span>
                        {deployment.total_trades_executed || 0} trades
                      </span>
                    </div>
                  </div>

                  {deployment.terminated_at && (
                    <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                      Terminated: {format(new Date(deployment.terminated_at), 'MMM d, HH:mm')}
                      {deployment.termination_reason && (
                        <span className="ml-1 text-yellow-400">({deployment.termination_reason})</span>
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
          <div className="pt-2 border-t border-border/50 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Avg uptime: <span className="text-foreground">{formatUptime(stats.avgUptime)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Cost per trade: <span className="text-foreground">
                ${stats.totalTrades > 0 ? (stats.totalCost / stats.totalTrades).toFixed(4) : '0.00'}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper for Label component
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVPSLatencyLogs } from '@/hooks/useVPSLatencyLogs';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';

const LATENCY_THRESHOLDS = {
  optimal: 50,
  acceptable: 150,
};

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function VPSLatencyChart() {
  const { logs, loading: logsLoading } = useVPSLatencyLogs(undefined, 30);
  const { deployments, loading: deploymentsLoading } = useVPSDeployments();

  const loading = logsLoading || deploymentsLoading;

  // Group logs by timestamp and deployment
  const chartData = useMemo(() => {
    if (logs.length === 0) return [];

    // Group logs into 1-minute buckets
    const buckets: Record<string, Record<string, number[]>> = {};
    
    logs.forEach(log => {
      if (!log.recorded_at) return;
      const time = new Date(log.recorded_at);
      const bucketKey = format(time, 'HH:mm');
      const deploymentId = log.vps_deployment_id || 'unknown';
      
      if (!buckets[bucketKey]) buckets[bucketKey] = {};
      if (!buckets[bucketKey][deploymentId]) buckets[bucketKey][deploymentId] = [];
      buckets[bucketKey][deploymentId].push(log.latency_ms);
    });

    // Convert to chart format with averaged values
    return Object.entries(buckets)
      .map(([time, deploymentData]) => {
        const point: Record<string, number | string> = { time };
        Object.entries(deploymentData).forEach(([deploymentId, latencies]) => {
          point[deploymentId] = Math.round(
            latencies.reduce((a, b) => a + b, 0) / latencies.length
          );
        });
        return point;
      })
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));
  }, [logs]);

  // Get unique deployment IDs from logs
  const deploymentIds = useMemo(() => {
    const ids = new Set<string>();
    logs.forEach(log => {
      if (log.vps_deployment_id) ids.add(log.vps_deployment_id);
    });
    return Array.from(ids);
  }, [logs]);

  // Map deployment IDs to labels
  const getDeploymentLabel = (id: string) => {
    const deployment = deployments.find(d => d.id === id);
    if (deployment) {
      return `${deployment.provider} (${deployment.region_city || deployment.region})`;
    }
    return id.slice(0, 8);
  };

  // Calculate current average latency
  const currentAvgLatency = useMemo(() => {
    if (logs.length === 0) return null;
    const recent = logs.slice(-20);
    return Math.round(recent.reduce((sum, l) => sum + l.latency_ms, 0) / recent.length);
  }, [logs]);

  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-muted-foreground';
    if (latency < LATENCY_THRESHOLDS.optimal) return 'text-emerald-400';
    if (latency < LATENCY_THRESHOLDS.acceptable) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[180px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-purple-400" />
            VPS Latency Monitor
          </CardTitle>
          {currentAvgLatency !== null && (
            <div className={`text-sm font-mono ${getLatencyColor(currentAvgLatency)}`}>
              {currentAvgLatency}ms avg
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            No latency data available yet
          </div>
        ) : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                  tickFormatter={(value) => `${value}ms`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => [
                    `${value}ms`,
                    getDeploymentLabel(name),
                  ]}
                />
                
                {/* Threshold reference lines */}
                <ReferenceLine 
                  y={LATENCY_THRESHOLDS.optimal} 
                  stroke="hsl(var(--chart-2))" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />
                <ReferenceLine 
                  y={LATENCY_THRESHOLDS.acceptable} 
                  stroke="hsl(var(--destructive))" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />

                {/* Lines for each deployment */}
                {deploymentIds.map((id, index) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend */}
        {deploymentIds.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border/50 flex flex-wrap gap-3">
            {deploymentIds.map((id, index) => (
              <div key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{getDeploymentLabel(id)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Threshold Legend */}
        <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="text-emerald-400">●</span> &lt;50ms optimal
          </span>
          <span className="flex items-center gap-1">
            <span className="text-yellow-400">●</span> 50-150ms acceptable
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-400">●</span> &gt;150ms degraded
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

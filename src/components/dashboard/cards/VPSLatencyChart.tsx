import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useVPSLatencyLogs } from '@/hooks/useVPSLatencyLogs';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { Activity, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';

const LATENCY_THRESHOLDS = {
  optimal: 50,
  acceptable: 150,
};

const COLORS = [
  'hsl(142, 76%, 36%)', // emerald
  'hsl(217, 91%, 60%)', // blue
  'hsl(280, 65%, 60%)', // purple
  'hsl(25, 95%, 53%)',  // orange
  'hsl(330, 81%, 60%)', // pink
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

  // Calculate current and stats
  const latencyStats = useMemo(() => {
    if (logs.length === 0) return { current: null, min: null, max: null, avg: null, alerts: 0 };
    const recent = logs.slice(-20);
    const allLatencies = recent.map(l => l.latency_ms);
    const current = allLatencies[allLatencies.length - 1] || null;
    const min = Math.min(...allLatencies);
    const max = Math.max(...allLatencies);
    const avg = Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length);
    const alerts = allLatencies.filter(l => l > LATENCY_THRESHOLDS.acceptable).length;
    return { current, min, max, avg, alerts };
  }, [logs]);

  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-muted-foreground';
    if (latency < LATENCY_THRESHOLDS.optimal) return 'text-emerald-400';
    if (latency < LATENCY_THRESHOLDS.acceptable) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getLatencyStatus = (latency: number | null) => {
    if (latency === null) return { text: 'No Data', icon: WifiOff };
    if (latency < LATENCY_THRESHOLDS.optimal) return { text: 'Optimal', icon: Wifi };
    if (latency < LATENCY_THRESHOLDS.acceptable) return { text: 'Acceptable', icon: Wifi };
    return { text: 'Degraded', icon: AlertTriangle };
  };

  const status = getLatencyStatus(latencyStats.current);
  const StatusIcon = status.icon;

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
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
            Real-Time Latency Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            {latencyStats.alerts > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {latencyStats.alerts} alerts
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`text-[10px] ${
                latencyStats.current === null ? 'bg-muted text-muted-foreground' :
                latencyStats.current < LATENCY_THRESHOLDS.optimal ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                latencyStats.current < LATENCY_THRESHOLDS.acceptable ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                'bg-red-500/10 text-red-400 border-red-500/30'
              }`}
            >
              <StatusIcon className="h-2.5 w-2.5 mr-1" />
              {status.text}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className={`text-lg font-bold font-mono ${getLatencyColor(latencyStats.current)}`}>
              {latencyStats.current ?? '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">Current (ms)</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold font-mono text-emerald-400">
              {latencyStats.min ?? '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">Min (ms)</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className="text-lg font-bold font-mono text-foreground">
              {latencyStats.avg ?? '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">Avg (ms)</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <div className={`text-lg font-bold font-mono ${getLatencyColor(latencyStats.max)}`}>
              {latencyStats.max ?? '-'}
            </div>
            <div className="text-[10px] text-muted-foreground">Max (ms)</div>
          </div>
        </div>

        {/* Chart */}
        {logs.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm rounded-lg bg-muted/20 border border-border/30">
            <div className="text-center">
              <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No latency data available</p>
              <p className="text-xs">Deploy a VPS to start monitoring</p>
            </div>
          </div>
        ) : (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                {/* Color-coded zones */}
                <ReferenceArea
                  y1={0}
                  y2={LATENCY_THRESHOLDS.optimal}
                  fill="hsl(142, 76%, 36%)"
                  fillOpacity={0.05}
                />
                <ReferenceArea
                  y1={LATENCY_THRESHOLDS.optimal}
                  y2={LATENCY_THRESHOLDS.acceptable}
                  fill="hsl(45, 93%, 47%)"
                  fillOpacity={0.05}
                />
                <ReferenceArea
                  y1={LATENCY_THRESHOLDS.acceptable}
                  y2={300}
                  fill="hsl(0, 84%, 60%)"
                  fillOpacity={0.05}
                />
                
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
                  tickFormatter={(value) => `${value}`}
                  domain={[0, 'dataMax + 20']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                  formatter={(value: number, name: string) => [
                    `${value}ms`,
                    getDeploymentLabel(name),
                  ]}
                />
                
                {/* Threshold reference lines */}
                <ReferenceLine 
                  y={LATENCY_THRESHOLDS.optimal} 
                  stroke="hsl(142, 76%, 36%)" 
                  strokeDasharray="4 4" 
                  strokeOpacity={0.6}
                  label={{ 
                    value: '50ms', 
                    position: 'right', 
                    fill: 'hsl(142, 76%, 36%)', 
                    fontSize: 9 
                  }}
                />
                <ReferenceLine 
                  y={LATENCY_THRESHOLDS.acceptable} 
                  stroke="hsl(0, 84%, 60%)" 
                  strokeDasharray="4 4" 
                  strokeOpacity={0.6}
                  label={{ 
                    value: '150ms', 
                    position: 'right', 
                    fill: 'hsl(0, 84%, 60%)', 
                    fontSize: 9 
                  }}
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
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                    animationDuration={300}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Legend */}
        {deploymentIds.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
            {deploymentIds.map((id, index) => (
              <div key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div 
                  className="w-3 h-1 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{getDeploymentLabel(id)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Threshold Legend */}
        <div className="flex gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/50" />
            &lt;50ms optimal
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/50" />
            50-150ms acceptable
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/50" />
            &gt;150ms degraded
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

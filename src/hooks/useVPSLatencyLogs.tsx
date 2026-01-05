import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VPSLatencyLog {
  id: string;
  vps_deployment_id: string | null;
  latency_ms: number;
  exchange: string | null;
  recorded_at: string | null;
}

export function useVPSLatencyLogs(deploymentId?: string, minutes: number = 30) {
  const [logs, setLogs] = useState<VPSLatencyLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    
    let query = supabase
      .from('vps_latency_logs')
      .select('*')
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true });

    if (deploymentId) {
      query = query.eq('vps_deployment_id', deploymentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching VPS latency logs:', error);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('vps_latency_logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vps_latency_logs' },
        (payload) => {
          const newLog = payload.new as VPSLatencyLog;
          if (!deploymentId || newLog.vps_deployment_id === deploymentId) {
            setLogs(prev => [...prev.slice(-100), newLog]);
          }
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [deploymentId, minutes]);

  return { logs, loading, refetch: fetchLogs };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VPSDeployment {
  id: string;
  user_id: string | null;
  provider: string;
  region: string;
  region_city: string | null;
  instance_id: string | null;
  ip_address: string | null;
  status: string | null;
  websocket_endpoint: string | null;
  websocket_connected: boolean | null;
  last_heartbeat: string | null;
  error_message: string | null;
  monthly_cost_estimate: number | null;
  created_at: string | null;
  updated_at: string | null;
  latency_ms?: number | null;
}

export function useVPSDeployments() {
  const [deployments, setDeployments] = useState<VPSDeployment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeployments = async () => {
    try {
      const { data, error } = await supabase
        .from('vps_deployments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDeployments(data || []);
    } catch (error) {
      console.error('Error fetching VPS deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('vps-deployments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vps_deployments',
        },
        () => {
          fetchDeployments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getHeartbeatStatus = (deployment: VPSDeployment): 'healthy' | 'warning' | 'stale' | 'offline' => {
    if (!deployment.last_heartbeat) return 'offline';
    
    const lastHeartbeat = new Date(deployment.last_heartbeat).getTime();
    const now = Date.now();
    const secondsAgo = (now - lastHeartbeat) / 1000;
    
    if (secondsAgo < 60) return 'healthy';
    if (secondsAgo < 180) return 'warning';
    if (secondsAgo < 600) return 'stale';
    return 'offline';
  };

  const getSecondsSinceHeartbeat = (deployment: VPSDeployment): number => {
    if (!deployment.last_heartbeat) return Infinity;
    return Math.floor((Date.now() - new Date(deployment.last_heartbeat).getTime()) / 1000);
  };

  return {
    deployments,
    loading,
    refetch: fetchDeployments,
    getHeartbeatStatus,
    getSecondsSinceHeartbeat,
  };
}

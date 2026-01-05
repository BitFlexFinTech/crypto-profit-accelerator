import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VPSScalingRule {
  id: string;
  user_id: string | null;
  volatility_threshold: number | null;
  max_instances: number | null;
  cooldown_minutes: number | null;
  scale_up_count: number | null;
  last_scale_at: string | null;
  is_enabled: boolean | null;
  provider: string | null;
  region: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useVPSScalingRules() {
  const [rule, setRule] = useState<VPSScalingRule | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRule = async () => {
    const { data, error } = await supabase
      .from('vps_scaling_rules')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching VPS scaling rules:', error);
    } else {
      setRule(data);
    }
    setLoading(false);
  };

  const createOrUpdateRule = async (updates: Partial<VPSScalingRule>) => {
    if (rule) {
      const { error } = await supabase
        .from('vps_scaling_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', rule.id);
      
      if (error) {
        console.error('Error updating scaling rule:', error);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('vps_scaling_rules')
        .insert(updates);
      
      if (error) {
        console.error('Error creating scaling rule:', error);
        return false;
      }
    }
    
    await fetchRule();
    return true;
  };

  useEffect(() => {
    fetchRule();

    const channel = supabase
      .channel('vps_scaling_rules_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vps_scaling_rules' },
        () => fetchRule()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { rule, loading, refetch: fetchRule, createOrUpdateRule };
}

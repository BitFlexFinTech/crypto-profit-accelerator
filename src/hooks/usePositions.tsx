import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Position } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

export function usePositions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPositions();
      subscribeToPositions();
    }
  }, [user]);

  const fetchPositions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });

      if (error) throw error;
      
      setPositions((data || []).map(p => ({
        ...p,
        entry_price: Number(p.entry_price),
        current_price: p.current_price ? Number(p.current_price) : undefined,
        quantity: Number(p.quantity),
        order_size_usd: Number(p.order_size_usd),
        unrealized_pnl: Number(p.unrealized_pnl),
        profit_target: Number(p.profit_target),
      })) as Position[]);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToPositions = () => {
    if (!user) return;

    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const closePosition = async (positionId: string) => {
    try {
      const { error } = await supabase.functions.invoke('close-position', {
        body: { positionId },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Position closed successfully',
      });

      await fetchPositions();
    } catch (error) {
      console.error('Error closing position:', error);
      toast({
        title: 'Error',
        description: 'Failed to close position',
        variant: 'destructive',
      });
    }
  };

  const closeAllPositions = async () => {
    try {
      const { error } = await supabase.functions.invoke('close-all-positions');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'All positions closed',
      });

      await fetchPositions();
    } catch (error) {
      console.error('Error closing all positions:', error);
      toast({
        title: 'Error',
        description: 'Failed to close all positions',
        variant: 'destructive',
      });
    }
  };

  const getTotalUnrealizedPnl = (): number => {
    return positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  };

  return {
    positions,
    loading,
    closePosition,
    closeAllPositions,
    getTotalUnrealizedPnl,
    refetch: fetchPositions,
  };
}

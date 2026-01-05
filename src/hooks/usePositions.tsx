import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Position } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

export function usePositions() {
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
    const cleanup = subscribeToPositions();
    return cleanup;
  }, []);

  const fetchPositions = async () => {
    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
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
    const channel = supabase
      .channel('positions-and-balances-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        (payload) => {
          console.log('[Realtime] Position update:', payload.eventType);
          fetchPositions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'balances',
        },
        (payload) => {
          console.log('[Realtime] Balance update:', payload.eventType);
          // Could trigger a balance refresh here if needed
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload) => {
          console.log('[Realtime] Trade update:', payload.eventType);
          fetchPositions(); // Refresh positions when trades change
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const closingPositionsRef = useRef<Set<string>>(new Set());

  const closePosition = async (positionId: string) => {
    // Prevent duplicate close attempts
    if (closingPositionsRef.current.has(positionId)) {
      console.log('Already closing position:', positionId);
      return;
    }
    closingPositionsRef.current.add(positionId);

    try {
      // STRICT RULE: Always require profit - trades only close at profit target
      const { data, error } = await supabase.functions.invoke('close-position', {
        body: { positionId, requireProfit: true },
      });

      if (error) throw error;

      // Handle idempotent response
      if (data?.alreadyClosed) {
        console.log('Position was already closed:', positionId);
      }

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
    } finally {
      closingPositionsRef.current.delete(positionId);
    }
  };

  const closeAllPositions = async () => {
    try {
      for (const position of positions) {
        // STRICT RULE: Always require profit when closing positions
        await supabase.functions.invoke('close-position', {
          body: { positionId: position.id, requireProfit: true },
        });
      }

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

  // Removed estimated PnL calculation - using live exchange equity instead

  const reconcilePositions = async (autoFix = false) => {
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-positions', {
        body: { autoFix },
      });

      if (error) throw error;

      if (autoFix && data?.summary?.fixed > 0) {
        await fetchPositions();
      }

      return data;
    } catch (error) {
      console.error('Error reconciling positions:', error);
      throw error;
    }
  };

  return {
    positions,
    loading,
    closePosition,
    closeAllPositions,
    reconcilePositions,
    refetch: fetchPositions,
  };
}

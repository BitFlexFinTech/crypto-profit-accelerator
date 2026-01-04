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
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
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

  const closingPositionsRef = useRef<Set<string>>(new Set());

  const closePosition = async (positionId: string) => {
    // Prevent duplicate close attempts
    if (closingPositionsRef.current.has(positionId)) {
      console.log('Already closing position:', positionId);
      return;
    }
    closingPositionsRef.current.add(positionId);

    try {
      const { data, error } = await supabase.functions.invoke('close-position', {
        body: { positionId },
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
        await supabase.functions.invoke('close-position', {
          body: { positionId: position.id },
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

  const updatePositionPrice = (positionId: string, currentPrice: number) => {
    setPositions(prev => prev.map(p => {
      if (p.id !== positionId) return p;
      
      // Calculate gross PnL
      let grossPnl: number;
      if (p.direction === 'long') {
        grossPnl = (currentPrice - p.entry_price) * p.quantity * (p.leverage || 1);
      } else {
        grossPnl = (p.entry_price - currentPrice) * p.quantity * (p.leverage || 1);
      }
      
      // Calculate fees (matching the checkProfitTargets calculation)
      const feeRate = p.trade_type === 'spot' ? 0.001 : 0.0005;
      const entryFee = p.order_size_usd * feeRate;
      const exitFee = p.order_size_usd * feeRate;
      const fundingFee = p.trade_type === 'futures' ? p.order_size_usd * 0.0001 : 0;
      const totalFees = entryFee + exitFee + fundingFee;
      
      // Net PnL after all fees
      const netPnl = grossPnl - totalFees;
      
      return {
        ...p,
        current_price: currentPrice,
        unrealized_pnl: netPnl,
      };
    }));
  };

  const getTotalUnrealizedPnl = (): number => {
    return positions.reduce((sum, p) => sum + p.unrealized_pnl, 0);
  };

  return {
    positions,
    loading,
    closePosition,
    closeAllPositions,
    updatePositionPrice,
    getTotalUnrealizedPnl,
    refetch: fetchPositions,
  };
}

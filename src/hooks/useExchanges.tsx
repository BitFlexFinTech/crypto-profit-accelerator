import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Exchange, Balance, ExchangeName } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

export function useExchanges() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchExchanges();
      fetchBalances();
    }
  }, [user]);

  const fetchExchanges = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('exchanges')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setExchanges((data || []) as Exchange[]);
    } catch (error) {
      console.error('Error fetching exchanges:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('balances')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setBalances((data || []).map(b => ({
        ...b,
        available: Number(b.available),
        locked: Number(b.locked),
        total: Number(b.total),
      })) as Balance[]);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  const connectExchange = async (
    exchangeName: ExchangeName,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ) => {
    if (!user) return;

    try {
      // Check if exchange already exists
      const existing = exchanges.find(e => e.exchange === exchangeName);
      
      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('exchanges')
          .update({
            api_key_encrypted: apiKey,
            api_secret_encrypted: apiSecret,
            passphrase_encrypted: passphrase || null,
            is_connected: true,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('exchanges')
          .insert({
            user_id: user.id,
            exchange: exchangeName,
            api_key_encrypted: apiKey,
            api_secret_encrypted: apiSecret,
            passphrase_encrypted: passphrase || null,
            is_connected: true,
            is_enabled: true,
            spot_enabled: true,
            futures_enabled: false,
          });

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `${exchangeName} connected successfully`,
      });

      await fetchExchanges();
    } catch (error) {
      console.error('Error connecting exchange:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect exchange',
        variant: 'destructive',
      });
    }
  };

  const disconnectExchange = async (exchangeId: string) => {
    try {
      const { error } = await supabase
        .from('exchanges')
        .update({
          api_key_encrypted: null,
          api_secret_encrypted: null,
          passphrase_encrypted: null,
          is_connected: false,
        })
        .eq('id', exchangeId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Exchange disconnected',
      });

      await fetchExchanges();
    } catch (error) {
      console.error('Error disconnecting exchange:', error);
      toast({
        title: 'Error',
        description: 'Failed to disconnect exchange',
        variant: 'destructive',
      });
    }
  };

  const toggleFutures = async (exchangeId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('exchanges')
        .update({ futures_enabled: enabled })
        .eq('id', exchangeId);

      if (error) throw error;
      await fetchExchanges();
    } catch (error) {
      console.error('Error toggling futures:', error);
      toast({
        title: 'Error',
        description: 'Failed to update futures setting',
        variant: 'destructive',
      });
    }
  };

  const syncBalances = async () => {
    if (!user) return;
    
    setSyncing(true);
    try {
      // Call edge function to sync balances from all connected exchanges
      const { data, error } = await supabase.functions.invoke('sync-balances');
      
      if (error) throw error;
      
      await fetchBalances();
      await fetchExchanges();
      
      toast({
        title: 'Success',
        description: 'Balances synced successfully',
      });
    } catch (error) {
      console.error('Error syncing balances:', error);
      toast({
        title: 'Error',
        description: 'Failed to sync balances',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const getExchangeBalance = (exchangeId: string): number => {
    const balance = balances.find(b => b.exchange_id === exchangeId);
    return balance?.total || 0;
  };

  const getTotalBalance = (): number => {
    return balances.reduce((sum, b) => sum + b.total, 0);
  };

  return {
    exchanges,
    balances,
    loading,
    syncing,
    connectExchange,
    disconnectExchange,
    toggleFutures,
    syncBalances,
    getExchangeBalance,
    getTotalBalance,
    refetch: fetchExchanges,
  };
}

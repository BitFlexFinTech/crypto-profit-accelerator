import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Exchange, Balance, ExchangeName } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export function useExchanges() {
  const { toast } = useToast();
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchExchanges();
    fetchBalances();
  }, []);

  const fetchExchanges = async () => {
    try {
      const { data, error } = await supabase
        .from('exchanges')
        .select('*');

      if (error) throw error;
      setExchanges((data || []) as Exchange[]);
    } catch (error) {
      console.error('Error fetching exchanges:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    try {
      const { data, error } = await supabase
        .from('balances')
        .select('*');

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

  // Test connection before saving API keys
  const testConnection = useCallback(async (
    exchangeName: ExchangeName,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ): Promise<{ success: boolean; message: string; balance?: number }> => {
    setTesting(true);
    try {
      // Call the test-connection edge function (we'll create this)
      const { data, error } = await supabase.functions.invoke('test-connection', {
        body: {
          exchange: exchangeName,
          apiKey,
          apiSecret,
          passphrase,
        },
      });

      if (error) throw error;

      if (data?.success) {
        return {
          success: true,
          message: `Connected! Balance: $${data.balance?.toFixed(2) || '0.00'} USDT`,
          balance: data.balance,
        };
      } else {
        return {
          success: false,
          message: data?.error || 'Connection test failed',
        };
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    } finally {
      setTesting(false);
    }
  }, []);

  const connectExchange = async (
    exchangeName: ExchangeName,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ) => {
    try {
      const existing = exchanges.find(e => e.exchange === exchangeName);
      
      if (existing) {
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
        const { error } = await supabase
          .from('exchanges')
          .insert({
            user_id: DEFAULT_USER_ID,
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
    setSyncing(true);
    try {
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

  const getConnectedExchangeNames = (): ExchangeName[] => {
    return exchanges
      .filter(e => e.is_connected)
      .map(e => e.exchange as ExchangeName);
  };

  return {
    exchanges,
    balances,
    loading,
    syncing,
    testing,
    connectExchange,
    disconnectExchange,
    toggleFutures,
    syncBalances,
    testConnection,
    getExchangeBalance,
    getTotalBalance,
    getConnectedExchangeNames,
    refetch: fetchExchanges,
  };
}

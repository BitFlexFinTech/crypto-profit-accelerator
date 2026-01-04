import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SetupProgress } from '@/types/trading';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export function useSetupProgress() {
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const { data, error } = await supabase
        .from('setup_progress')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProgress(data as SetupProgress);
      } else {
        // Create initial progress
        const { data: newProgress, error: createError } = await supabase
          .from('setup_progress')
          .insert({
            user_id: DEFAULT_USER_ID,
            current_step: 1,
            is_completed: false,
            exchanges_connected: [],
          })
          .select()
          .single();

        if (createError) throw createError;
        setProgress(newProgress as SetupProgress);
      }
    } catch (error) {
      console.error('Error fetching setup progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStep = useCallback(async (step: number) => {
    if (!progress) return;

    try {
      const { error } = await supabase
        .from('setup_progress')
        .update({ current_step: step })
        .eq('id', progress.id);

      if (error) throw error;
      setProgress({ ...progress, current_step: step });
    } catch (error) {
      console.error('Error updating step:', error);
    }
  }, [progress]);

  const completeSetup = useCallback(async () => {
    if (!progress) return;

    try {
      const { error } = await supabase
        .from('setup_progress')
        .update({ is_completed: true, current_step: 4 })
        .eq('id', progress.id);

      if (error) throw error;
      setProgress({ ...progress, is_completed: true, current_step: 4 });
    } catch (error) {
      console.error('Error completing setup:', error);
    }
  }, [progress]);

  const updateExchangesConnected = useCallback(async (exchanges: string[]) => {
    if (!progress) return;

    try {
      const { error } = await supabase
        .from('setup_progress')
        .update({ exchanges_connected: exchanges })
        .eq('id', progress.id);

      if (error) throw error;
      setProgress({ ...progress, exchanges_connected: exchanges });
    } catch (error) {
      console.error('Error updating exchanges:', error);
    }
  }, [progress]);

  return {
    progress,
    loading,
    updateStep,
    completeSetup,
    updateExchangesConnected,
    refetch: fetchProgress,
  };
}

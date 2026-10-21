'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { applyRealtimeChange } from '@/lib/realtime-notify';
import { subscribeRealtimeTables } from '@/lib/realtime';
import { getSupabaseClient } from '@/lib/supabase/client';

export function RealtimeNotifications() {
  const { user, ready } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!ready || !userId) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }
    return subscribeRealtimeTables(client, (change) => {
      void applyRealtimeChange(change, userId);
    });
  }, [ready, userId]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { applyRealtimeChange } from '@/lib/realtime-notify';
import {
  canSubscribeRealtime,
  isRealtimeSessionReady,
  subscribeRealtimeTables,
} from '@/lib/realtime';
import { getSupabaseClient } from '@/lib/supabase/client';

export function RealtimeNotifications() {
  const { user, ready } = useAuth();
  const userId = user?.id;
  const email = user?.email;

  useEffect(() => {
    if (!ready || !userId || !canSubscribeRealtime(userId, email)) {
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let cancelled = false;
    let teardown: (() => void) | null = null;

    const start = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (
          cancelled ||
          !isRealtimeSessionReady({
            userId,
            email,
            accessToken: data.session?.access_token,
          })
        ) {
          return;
        }
        teardown = subscribeRealtimeTables(
          client,
          (change) => {
            void applyRealtimeChange(change, userId);
          },
          `sponsor-auction-ops:${userId}`,
        );
      } catch {
        // 세션이 없으면 구독하지 않습니다.
      }
    };

    void start();
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [email, ready, userId]);

  return null;
}

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { isDemoAccountEmail } from '@/lib/auth-mock';
import { isUuid } from '@/lib/uuid';
import type { Database } from '@/types/database';
import {
  REALTIME_TABLES,
  type RealtimeChange,
  type RealtimeTable,
} from '@/types/realtime';

export const REALTIME_MAX_RETRIES = 3;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isRealtimeTable(value: string): value is RealtimeTable {
  return (REALTIME_TABLES as readonly string[]).includes(value);
}

export function canSubscribeRealtime(userId?: string | null, email?: string | null) {
  return isUuid(userId) && !isDemoAccountEmail(email);
}

export function isRealtimeSessionReady(input: {
  userId?: string | null;
  email?: string | null;
  accessToken?: string | null;
}) {
  return canSubscribeRealtime(input.userId, input.email) && Boolean(input.accessToken?.trim());
}

export function realtimeRetryDelayMs(attempt: number) {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(1000 * 2 ** safeAttempt, 8000);
}

export function parseRealtimePayload(payload: {
  table?: string;
  eventType?: string;
  new?: unknown;
  old?: unknown;
  record?: unknown;
  old_record?: unknown;
}): RealtimeChange | null {
  const table = typeof payload.table === 'string' ? payload.table : '';
  if (!isRealtimeTable(table)) {
    return null;
  }
  const eventRaw = (payload.eventType || '').toUpperCase();
  const eventType: RealtimeChange['eventType'] =
    eventRaw === 'UPDATE' ? 'UPDATE' : eventRaw === 'DELETE' ? 'DELETE' : 'INSERT';
  const record =
    asRecord(payload.new) ??
    asRecord(payload.record) ??
    (eventType === 'DELETE' ? asRecord(payload.old) ?? asRecord(payload.old_record) : null);
  if (!record) {
    return null;
  }
  return {
    table,
    eventType,
    record,
    oldRecord: asRecord(payload.old) ?? asRecord(payload.old_record),
  };
}

export function subscribeRealtimeTables(
  client: SupabaseClient<Database>,
  onChange: (change: RealtimeChange) => void,
  channelName = 'sponsor-auction-ops',
): () => void {
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let stopped = false;
  let loggedGiveUp = false;

  const clearRetry = () => {
    if (!retryTimer) {
      return;
    }
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const teardown = () => {
    clearRetry();
    if (!channel) {
      return;
    }
    try {
      void client.removeChannel(channel);
    } catch (error) {
      console.warn('[SponsorAuction] Realtime 구독 해제에 실패했습니다.', error);
    }
    channel = null;
  };

  const start = () => {
    if (stopped) {
      return;
    }
    teardown();
    try {
      channel = client.channel(channelName);
      for (const table of REALTIME_TABLES) {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            const change = parseRealtimePayload({
              table,
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            });
            if (change) {
              onChange(change);
            }
          },
        );
      }
      channel.subscribe((status) => {
        if (stopped) {
          return;
        }
        if (status === 'SUBSCRIBED') {
          attempts = 0;
          loggedGiveUp = false;
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
          return;
        }
        if (attempts >= REALTIME_MAX_RETRIES) {
          if (!loggedGiveUp) {
            loggedGiveUp = true;
            console.warn('[SponsorAuction] Realtime 구독을 중단합니다.', status);
          }
          teardown();
          return;
        }
        const delay = realtimeRetryDelayMs(attempts);
        attempts += 1;
        clearRetry();
        retryTimer = setTimeout(start, delay);
      });
    } catch (error) {
      console.warn('[SponsorAuction] Realtime 구독을 시작하지 못했습니다.', error);
      teardown();
    }
  };

  start();

  return () => {
    stopped = true;
    teardown();
  };
}

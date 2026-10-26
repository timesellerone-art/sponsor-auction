import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  REALTIME_TABLES,
  type RealtimeChange,
  type RealtimeTable,
} from '@/types/realtime';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isRealtimeTable(value: string): value is RealtimeTable {
  return (REALTIME_TABLES as readonly string[]).includes(value);
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
  const teardown = () => {
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
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[SponsorAuction] Realtime 구독이 불안정합니다.', status);
      }
    });
  } catch (error) {
    console.warn('[SponsorAuction] Realtime 구독을 시작하지 못했습니다.', error);
    teardown();
    return () => undefined;
  }

  return teardown;
}

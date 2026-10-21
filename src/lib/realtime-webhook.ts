import { createAdminClient } from '@/lib/supabase/admin';
import { notifyLifecycleEvent } from '@/lib/notification';
import { parseRealtimePayload } from '@/lib/realtime';
import type { RealtimeChange } from '@/types/realtime';

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseWebhookBody(body: unknown): RealtimeChange | null {
  const root = asRecord(body);
  if (!root) {
    return null;
  }
  const nested = asRecord(root.payload) ?? asRecord(root.record);
  const table =
    asText(root.table) ||
    asText(root.table_name) ||
    asText(asRecord(root.data)?.table);
  const eventType =
    asText(root.type) ||
    asText(root.eventType) ||
    asText(root.event) ||
    asText(asRecord(root.data)?.type);
  const record =
    asRecord(root.record) ??
    asRecord(root.new) ??
    asRecord(nested) ??
    asRecord(asRecord(root.data)?.record);
  return parseRealtimePayload({
    table,
    eventType,
    record,
    old_record: asRecord(root.old_record) ?? asRecord(root.old),
  });
}

export async function deliverRealtimeWebhook(change: RealtimeChange) {
  if (change.eventType === 'DELETE') {
    return { ok: true as const, mocked: true, skipped: true as const };
  }

  if (change.table === 'bids' && change.eventType === 'INSERT') {
    const auctionId = asText(change.record.auction_id);
    let title = '캠페인';
    let toUserId: string | null = null;
    try {
      const admin = createAdminClient();
      if (admin && auctionId) {
        const { data } = await admin
          .from('auctions')
          .select('title, author_id')
          .eq('id', auctionId)
          .maybeSingle();
        title = asText(data?.title) || title;
        toUserId = asText(data?.author_id) || null;
      }
    } catch (error) {
      console.warn('[SponsorAuction] 웹훅 경매 조회를 건너뜁니다.', error);
    }

    const result = await notifyLifecycleEvent({
      event: 'bid_received',
      auctionId,
      auctionTitle: title,
      toUserId,
      toName: asText(change.record.creator_name) || null,
    });
    return { ok: result.ok, mocked: result.mocked, skipped: false as const };
  }

  console.info('[SponsorAuction] Realtime 웹훅 수신', {
    table: change.table,
    eventType: change.eventType,
    id: asText(change.record.id),
  });
  return { ok: true as const, mocked: true, skipped: false as const };
}

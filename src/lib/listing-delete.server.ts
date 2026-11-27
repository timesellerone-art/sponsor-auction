import 'server-only';

import { releaseAuctionCampaignCredits } from '@/lib/campaign-credit';
import {
  LISTING_DELETE_FAIL,
  LISTING_DELETE_FORBIDDEN,
  LISTING_DELETE_NOT_FOUND,
  LISTING_DELETE_OWNER_BLOCKED,
  canOwnerDeleteCampaign,
  canOwnerDeleteTimeslot,
} from '@/lib/listing-delete';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';
import type { AuctionStatus } from '@/types/auction';
import type { TimeSlotStatus } from '@/types/timeslot';

type DeleteActor = {
  userId?: string;
  isAdmin: boolean;
};

type DeleteResult =
  | { ok: true }
  | { ok: false; status: number; error: string; errorCode: string };

function fail(status: number, error: string, errorCode: string): DeleteResult {
  return { ok: false, status, error, errorCode };
}

async function writer() {
  return createAdminClient();
}

async function cleanupListingRelations(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  listingId: string,
  reason: string,
) {
  const released = await releaseAuctionCampaignCredits(client, listingId, reason);
  if (!released.ok) {
    return released;
  }

  const extraDeletes = await Promise.all([
    client.from('chat_messages').delete().eq('auction_id', listingId),
    client.from('compliance_logs').delete().eq('auction_id', listingId),
    client.from('tax_invoice_logs').delete().eq('auction_id', listingId),
    client.from('payouts').delete().eq('auction_id', listingId),
    client.from('payments').delete().eq('auction_id', listingId),
  ]);
  const failed = extraDeletes.find((item) => item.error);
  if (failed?.error && !/schema cache|does not exist|Could not find/i.test(failed.error.message)) {
    return { ok: false as const, code: 'RELATION_DELETE_FAILED', message: failed.error.message };
  }
  return { ok: true as const };
}

async function hasConfirmedPayment(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  listingId: string,
) {
  const { data, error } = await client
    .from('payments')
    .select('order_id, status')
    .eq('auction_id', listingId)
    .eq('status', 'confirmed')
    .limit(1);
  if (error) {
    return false;
  }
  return (data ?? []).length > 0;
}

export async function deleteCampaignListing(
  auctionId: string,
  actor: DeleteActor,
): Promise<DeleteResult> {
  const id = auctionId.trim();
  if (!id || !isUuid(id)) {
    return fail(400, '캠페인 ID가 올바르지 않습니다.', 'INVALID_ID');
  }
  if (!actor.userId) {
    return fail(401, '캠페인을 삭제하려면 로그인해 주세요.', 'UNAUTHORIZED');
  }

  const client = await writer();
  if (!client) {
    return fail(503, '삭제 권한으로 DB에 연결하지 못했습니다.', 'DB_UNAVAILABLE');
  }

  const loaded = await client
    .from('auctions')
    .select('id, author_id, status, winner_bid_id')
    .eq('id', id)
    .maybeSingle();
  if (loaded.error) {
    return fail(500, loaded.error.message, 'LOAD_FAILED');
  }
  if (!loaded.data) {
    return fail(404, LISTING_DELETE_NOT_FOUND, 'NOT_FOUND');
  }

  const ownerId = loaded.data.author_id;
  if (!actor.isAdmin) {
    if (!ownerId || ownerId !== actor.userId) {
      return fail(403, LISTING_DELETE_FORBIDDEN, 'FORBIDDEN');
    }
    const paid = await hasConfirmedPayment(client, id);
    if (
      paid ||
      !canOwnerDeleteCampaign({
        status: loaded.data.status as AuctionStatus,
        winnerBidId: loaded.data.winner_bid_id,
      })
    ) {
      return fail(409, LISTING_DELETE_OWNER_BLOCKED, 'DELETE_BLOCKED');
    }
  }

  const cleaned = await cleanupListingRelations(client, id, '캠페인 삭제로 예치 크레딧 복구');
  if (!cleaned.ok) {
    return fail(500, cleaned.message, cleaned.code);
  }

  const unlocked = await client.from('auctions').update({ winner_bid_id: null }).eq('id', id);
  if (unlocked.error) {
    return fail(500, unlocked.error.message, 'UNLOCK_FAILED');
  }

  const bids = await client.from('bids').delete().eq('auction_id', id);
  if (bids.error && !/이미 낙찰/i.test(bids.error.message)) {
    return fail(500, bids.error.message, 'BID_DELETE_FAILED');
  }

  const removed = await client.from('auctions').delete().eq('id', id);
  if (removed.error) {
    return fail(500, removed.error.message, 'DELETE_FAILED');
  }
  return { ok: true };
}

export async function deleteTimeslotListing(
  slotId: string,
  actor: DeleteActor,
): Promise<DeleteResult> {
  const id = slotId.trim();
  if (!id || !isUuid(id)) {
    return fail(400, '크리에이터 상품 ID가 올바르지 않습니다.', 'INVALID_ID');
  }
  if (!actor.userId) {
    return fail(401, '크리에이터 상품을 삭제하려면 로그인해 주세요.', 'UNAUTHORIZED');
  }

  const client = await writer();
  if (!client) {
    return fail(503, '삭제 권한으로 DB에 연결하지 못했습니다.', 'DB_UNAVAILABLE');
  }

  const loaded = await client
    .from('time_slots')
    .select('id, creator_id, status, winner_bid_id, deadline')
    .eq('id', id)
    .maybeSingle();
  if (loaded.error) {
    return fail(500, loaded.error.message, 'LOAD_FAILED');
  }
  if (!loaded.data) {
    return fail(404, LISTING_DELETE_NOT_FOUND, 'NOT_FOUND');
  }

  const ownerId = loaded.data.creator_id;
  if (!actor.isAdmin) {
    if (!ownerId || ownerId !== actor.userId) {
      return fail(403, LISTING_DELETE_FORBIDDEN, 'FORBIDDEN');
    }
    const paid = await hasConfirmedPayment(client, id);
    if (
      !canOwnerDeleteTimeslot({
        status: (loaded.data.status as TimeSlotStatus) ?? 'open',
        winnerBidId: loaded.data.winner_bid_id,
        deadline: loaded.data.deadline ?? '',
        paidAt: paid ? new Date().toISOString() : null,
      })
    ) {
      return fail(409, LISTING_DELETE_OWNER_BLOCKED, 'DELETE_BLOCKED');
    }
  }

  const cleaned = await cleanupListingRelations(client, id, '크리에이터 상품 삭제로 예치 크레딧 복구');
  if (!cleaned.ok) {
    return fail(500, cleaned.message, cleaned.code);
  }

  const unlocked = await client.from('time_slots').update({ winner_bid_id: null }).eq('id', id);
  if (unlocked.error) {
    return fail(500, unlocked.error.message, 'UNLOCK_FAILED');
  }

  const bids = await client.from('time_slot_bids').delete().eq('time_slot_id', id);
  if (bids.error) {
    return fail(500, bids.error.message, 'BID_DELETE_FAILED');
  }

  const removed = await client.from('time_slots').delete().eq('id', id);
  if (removed.error) {
    return fail(500, removed.error.message, 'DELETE_FAILED');
  }
  return { ok: true };
}

export function deleteJson(result: DeleteResult) {
  if (result.ok) {
    return { data: true };
  }
  return {
    error: result.error || LISTING_DELETE_FAIL,
    errorMessage: result.error || LISTING_DELETE_FAIL,
    errorCode: result.errorCode,
  };
}

import 'server-only';

import { attachAdminBusinessFields } from '@/lib/admin-profile-business.server';
import { listAuctionsFromDatabase, listBidsFromDatabase } from '@/lib/auctions';
import { notifyUpcomingDeadlines } from '@/lib/notification-deadline';
import { listPayoutsFromDatabase } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import { listAndBackfillProfiles } from '@/lib/supabase/profile-sync';
import { timeSlotBidToBidItem } from '@/lib/timeslot-deal';
import { listTimeSlotBidsBySlotIds, listTimeSlots } from '@/lib/timeslots';
import type { PayoutItem, ProfileItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';
import type { TimeSlotItem } from '@/types/timeslot';

export async function getAdminPayoutsFromDatabase(): Promise<PayoutItem[]> {
  const board = await getAdminBoardFromDatabase();
  return board.payouts;
}

export async function getAdminBoardFromDatabase(): Promise<{
  payouts: PayoutItem[];
  bids: BidItem[];
  profiles: ProfileItem[];
  auctions: AuctionItem[];
  timeslots: TimeSlotItem[];
}> {
  const client = createAdminClient();
  if (!client) {
    console.warn('[SponsorAuction] getAdminBoardFromDatabase: service role 클라이언트가 없습니다.');
    return { payouts: [], bids: [], profiles: [], auctions: [], timeslots: [] };
  }

  try {
    const [payouts, bids, profileResult, auctions, slotResult] = await Promise.all([
      listPayoutsFromDatabase(client),
      listBidsFromDatabase(client),
      listAndBackfillProfiles(client),
      listAuctionsFromDatabase(client),
      listTimeSlots({ client, includeHidden: true }),
    ]);
    const timeslots = Array.isArray(slotResult.data) ? slotResult.data : [];
    const slotBidResult = await listTimeSlotBidsBySlotIds(
      timeslots.map((item) => item.id),
      client,
    );
    const slotById = new Map(timeslots.map((item) => [item.id, item]));
    const timeslotBids = (Array.isArray(slotBidResult.data) ? slotBidResult.data : []).flatMap(
      (bid) => {
        const slot = slotById.get(bid.timeSlotId);
        return slot ? [timeSlotBidToBidItem(bid, slot)] : [];
      },
    );
    void notifyUpcomingDeadlines();
    const profiles = await attachAdminBusinessFields(
      client,
      profileResult.profiles.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        role: row.role,
        roles: row.roles,
        status: row.status,
        createdAt: row.createdAt,
      })),
    );
    return {
      payouts,
      bids: [...bids, ...timeslotBids],
      auctions,
      timeslots,
      profiles,
    };
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산/입찰/회원 서버 조회 실패', error);
    return { payouts: [], bids: [], profiles: [], auctions: [], timeslots: [] };
  }
}

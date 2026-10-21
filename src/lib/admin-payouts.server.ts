import 'server-only';

import { listBidsFromDatabase } from '@/lib/auctions';
import { notifyUpcomingDeadlines } from '@/lib/notification-deadline';
import { listPayoutsFromDatabase } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import { listAndBackfillProfiles } from '@/lib/supabase/profile-sync';
import type { PayoutItem, ProfileItem } from '@/types/admin';
import type { BidItem } from '@/types/auction';

export async function getAdminPayoutsFromDatabase(): Promise<PayoutItem[]> {
  const board = await getAdminBoardFromDatabase();
  return board.payouts;
}

export async function getAdminBoardFromDatabase(): Promise<{
  payouts: PayoutItem[];
  bids: BidItem[];
  profiles: ProfileItem[];
}> {
  const client = createAdminClient();
  if (!client) {
    console.warn('[SponsorAuction] getAdminBoardFromDatabase: service role 클라이언트가 없습니다.');
    return { payouts: [], bids: [], profiles: [] };
  }

  try {
    const [payouts, bids, profileResult] = await Promise.all([
      listPayoutsFromDatabase(client),
      listBidsFromDatabase(client),
      listAndBackfillProfiles(client),
    ]);
    void notifyUpcomingDeadlines();
    return {
      payouts,
      bids,
      profiles: profileResult.profiles.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        roles: row.roles,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산/입찰/회원 서버 조회 실패', error);
    return { payouts: [], bids: [], profiles: [] };
  }
}

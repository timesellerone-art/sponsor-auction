import 'server-only';

import { listBidsFromDatabase } from '@/lib/auctions';
import { notifyUpcomingDeadlines } from '@/lib/notification-deadline';
import { listPayoutsFromDatabase } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PayoutItem } from '@/types/admin';
import type { BidItem } from '@/types/auction';

export async function getAdminPayoutsFromDatabase(): Promise<PayoutItem[]> {
  const board = await getAdminBoardFromDatabase();
  return board.payouts;
}

export async function getAdminBoardFromDatabase(): Promise<{
  payouts: PayoutItem[];
  bids: BidItem[];
}> {
  const client = createAdminClient();
  if (!client) {
    console.warn('[SponsorAuction] getAdminBoardFromDatabase: service role 클라이언트가 없습니다.');
    return { payouts: [], bids: [] };
  }

  try {
    const [payouts, bids] = await Promise.all([
      listPayoutsFromDatabase(client),
      listBidsFromDatabase(client),
    ]);
    void notifyUpcomingDeadlines();
    return { payouts, bids };
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산/입찰 서버 조회 실패', error);
    return { payouts: [], bids: [] };
  }
}

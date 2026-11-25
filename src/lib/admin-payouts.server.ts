import 'server-only';

import { listAuctionsFromDatabase, listBidsFromDatabase } from '@/lib/auctions';
import { isBusinessVerificationStatus } from '@/lib/business-registration';
import { notifyUpcomingDeadlines } from '@/lib/notification-deadline';
import { listPayoutsFromDatabase } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import { listAndBackfillProfiles } from '@/lib/supabase/profile-sync';
import type { PayoutItem, ProfileItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export async function getAdminPayoutsFromDatabase(): Promise<PayoutItem[]> {
  const board = await getAdminBoardFromDatabase();
  return board.payouts;
}

export async function getAdminBoardFromDatabase(): Promise<{
  payouts: PayoutItem[];
  bids: BidItem[];
  profiles: ProfileItem[];
  auctions: AuctionItem[];
}> {
  const client = createAdminClient();
  if (!client) {
    console.warn('[SponsorAuction] getAdminBoardFromDatabase: service role 클라이언트가 없습니다.');
    return { payouts: [], bids: [], profiles: [], auctions: [] };
  }

  try {
    const [payouts, bids, profileResult, auctions] = await Promise.all([
      listPayoutsFromDatabase(client),
      listBidsFromDatabase(client),
      listAndBackfillProfiles(client),
      listAuctionsFromDatabase(client),
    ]);
    void notifyUpcomingDeadlines();
    const baseProfiles = profileResult.profiles.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      roles: row.roles,
      status: row.status,
      createdAt: row.createdAt,
    }));
    let extraRows = await client
      .from('profiles')
      .select('id, business_registration_number, business_verification_status, settlement_type');
    if (extraRows.error) {
      extraRows = await client
        .from('profiles')
        .select('id, business_registration_number, business_verification_status');
    }
    const businessById = new Map(
      (extraRows.error ? [] : extraRows.data ?? []).map((row) => [row.id, row]),
    );
    return {
      payouts,
      bids,
      auctions,
      profiles: baseProfiles.map((row): ProfileItem => {
        const extra = businessById.get(row.id);
        const status = extra?.business_verification_status ?? '';
        const settlementType =
          extra && 'settlement_type' in extra && extra.settlement_type === 'business'
            ? 'business'
            : extra && 'settlement_type' in extra && extra.settlement_type === 'individual'
              ? 'individual'
              : undefined;
        return {
          ...row,
          businessRegistrationNumber: extra?.business_registration_number ?? '',
          businessVerificationStatus: isBusinessVerificationStatus(status) ? status : undefined,
          settlementType,
        };
      }),
    };
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산/입찰/회원 서버 조회 실패', error);
    return { payouts: [], bids: [], profiles: [], auctions: [] };
  }
}

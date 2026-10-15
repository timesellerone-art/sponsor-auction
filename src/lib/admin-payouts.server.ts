import 'server-only';

import { listPayoutsFromDatabase } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PayoutItem } from '@/types/admin';

export async function getAdminPayoutsFromDatabase(): Promise<PayoutItem[]> {
  const client = createAdminClient();
  if (!client) {
    console.warn('[SponsorAuction] getAdminPayoutsFromDatabase: service role 클라이언트가 없습니다.');
    return [];
  }

  try {
    return await listPayoutsFromDatabase(client);
  } catch (error) {
    console.error('[SponsorAuction] 관리자 정산 서버 조회 실패', error);
    return [];
  }
}

import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { applyAdminPayoutIntegrity } from '@/lib/admin-integrity';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { listPayoutsForCreator } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import { isBusinessVerificationStatus } from '@/lib/business-registration';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('정산 내역을 보려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('정산 내역은 크리에이터 계정에서 확인할 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        { error: '정산 내역을 불러올 수 없습니다.', data: [] },
        { status: 503, headers: NO_STORE },
      );
    }

    const bids = await client
      .from('bids')
      .select('id, auction_id, bid_amount, status')
      .eq('creator_id', actor.userId);
    const bidRows = bids.data ?? [];
    const bidIds = bidRows.map((row) => String(row.id || '')).filter(Boolean);
    const auctionIds = bidRows.map((row) => String(row.auction_id || '')).filter(Boolean);
    const [payouts, profile] = await Promise.all([
      listPayoutsForCreator(client, {
        creatorId: actor.userId,
        bidIds,
        auctionIds,
      }),
      client
        .from('profiles')
        .select(
          'id, settlement_type, business_registration_number, business_verification_status',
        )
        .eq('id', actor.userId)
        .maybeSingle(),
    ]);
    const statusRaw = profile.data?.business_verification_status ?? '';
    const enriched = applyAdminPayoutIntegrity(
      payouts,
      auctionIds.map((id) => ({ id, title: '' })),
      bidRows.map((row) => ({
        id: String(row.id || ''),
        auctionId: String(row.auction_id || ''),
        bidAmount: Number(row.bid_amount) || 0,
        status: row.status === 'selected' ? 'selected' : 'pending',
      })),
      [
        {
          id: actor.userId,
          settlementType:
            profile.data?.settlement_type === 'business' ||
            profile.data?.settlement_type === 'individual'
              ? profile.data.settlement_type
              : undefined,
          businessRegistrationNumber: profile.data?.business_registration_number ?? '',
          businessVerificationStatus: isBusinessVerificationStatus(statusRaw)
            ? statusRaw
            : undefined,
        },
      ],
    );

    return NextResponse.json({ data: enriched }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '정산 내역을 불러오지 못했습니다.';
    return NextResponse.json({ error: message, data: [] }, { status: 500, headers: NO_STORE });
  }
}

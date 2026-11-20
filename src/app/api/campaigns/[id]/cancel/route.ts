import { rethrowPrerenderError } from '@/lib/prerender-error';
import { NextResponse } from 'next/server';
import { releaseAuctionCampaignCredits } from '@/lib/campaign-credit';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getPaymentActor();
    if (!actor?.userId) {
      return unauthorizedJson('캠페인을 취소하려면 로그인해 주세요.');
    }

    const { id } = await context.params;
    const auctionId = id.trim();
    if (!isUuid(auctionId)) {
      return NextResponse.json(
        { error: '캠페인 ID가 올바르지 않습니다.', errorCode: 'INVALID_AUCTION' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error: '크레딧 원장을 확인하지 못했습니다. 취소는 진행되지 않았습니다.',
          errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
        },
        { status: 503, headers: NO_STORE },
      );
    }

    const auction = await admin
      .from('auctions')
      .select('author_id')
      .eq('id', auctionId)
      .maybeSingle();
    if (auction.error) {
      return NextResponse.json(
        { error: auction.error.message, errorCode: 'RPC_ERROR' },
        { status: 500, headers: NO_STORE },
      );
    }
    if (!auction.data) {
      return NextResponse.json(
        { error: '캠페인을 찾지 못했습니다.', errorCode: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }
    if (!hasAuthRole(actor, 'admin') && auction.data.author_id !== actor.userId) {
      return forbiddenJson('본인 캠페인만 취소할 수 있습니다.');
    }

    const released = await releaseAuctionCampaignCredits(
      admin,
      auctionId,
      '캠페인 취소로 채택 크레딧 복구',
    );
    if (!released.ok) {
      return NextResponse.json(
        { error: released.message, errorCode: released.code },
        { status: 500, headers: NO_STORE },
      );
    }

    console.info('[SponsorAuction] 캠페인 취소 크레딧 복구', {
      auctionId,
      restoredCount: released.restoredCount,
      restoredAmount: released.restoredAmount,
    });
    return NextResponse.json(
      {
        ok: true,
        restoredCount: released.restoredCount,
        restoredAmount: released.restoredAmount,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '캠페인 취소에 실패했습니다.';
    return NextResponse.json(
      { error: message, errorCode: 'CANCEL_EXCEPTION' },
      { status: 500, headers: NO_STORE },
    );
  }
}

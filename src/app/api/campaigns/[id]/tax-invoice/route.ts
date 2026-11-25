import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { lookupTaxInvoiceForAuction } from '@/lib/popbill';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('세금계산서 상태를 보려면 로그인해 주세요.');
    }

    const { id } = await context.params;
    const auctionId = id.trim();
    if (!auctionId) {
      return NextResponse.json(
        { error: '캠페인 ID가 필요합니다.', issued: false, status: 'none', label: '미발행' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { issued: false, status: 'none', label: '미발행' },
        { headers: NO_STORE },
      );
    }

    const auction = isUuid(auctionId)
      ? await admin
          .from('auctions')
          .select('id, author_id, winner_bid_id')
          .eq('id', auctionId)
          .maybeSingle()
      : { data: null, error: null };
    const authorId = auction.data?.author_id ?? '';
    const winnerBidId = auction.data?.winner_bid_id ?? '';
    const isAuthor = Boolean(authorId && authorId === actor.userId);
    const isAdminUser = hasAuthRole(actor, 'admin');
    let isWinner = false;
    if (winnerBidId && isUuid(winnerBidId)) {
      const bid = await admin.from('bids').select('creator_id').eq('id', winnerBidId).maybeSingle();
      isWinner = Boolean(bid.data?.creator_id && bid.data.creator_id === actor.userId);
    }
    if (!isAuthor && !isAdminUser && !isWinner) {
      return forbiddenJson('이 캠페인의 세금계산서 상태는 당사자만 확인할 수 있습니다.');
    }

    const lookup = await lookupTaxInvoiceForAuction(auctionId);
    return NextResponse.json(lookup, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { issued: false, status: 'none', label: '미발행' },
      { status: 500, headers: NO_STORE },
    );
  }
}

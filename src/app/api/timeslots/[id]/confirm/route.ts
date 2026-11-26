import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { campaignAwardOrderId, campaignHoldQuote } from '@/lib/campaign-credit';
import { upsertPaidPayout } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { confirmTimeSlotPurchase, getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 구매 확정은 계속합니다.
    }
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('구매 확정하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'advertiser') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('구매 확정은 광고주만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const slotId = timeslotIdFromParam(id);
    const writer = await timeslotWriter();
    const slot = await getTimeSlotById(slotId, writer);
    if (!slot.data) {
      return NextResponse.json(
        {
          error: slot.error ?? '크리에이터 상품을 찾을 수 없습니다.',
          errorMessage: slot.error ?? '크리에이터 상품을 찾을 수 없습니다.',
          errorCode: 'TIMESLOT_NOT_FOUND',
        },
        { status: 404, headers: NO_STORE },
      );
    }
    const bids = await listTimeSlotBids(slot.data.id, writer);
    const winner = bids.data.find((item) => item.id === slot.data?.winnerBidId);
    if (!winner) {
      return NextResponse.json(
        { error: '선정된 제안을 찾을 수 없습니다.', errorMessage: '선정된 제안을 찾을 수 없습니다.' },
        { status: 400, headers: NO_STORE },
      );
    }
    if (
      winner.advertiserId &&
      isUuid(winner.advertiserId) &&
      winner.advertiserId !== actor.userId &&
      !hasAuthRole(actor, 'admin')
    ) {
      return forbiddenJson('선정된 광고주만 구매 확정할 수 있습니다.');
    }

    const result = await confirmTimeSlotPurchase(slot.data.id, actor.userId, writer);
    if (result.error || !result.data) {
      const message = result.error ?? '구매 확정하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (admin && isUuid(slot.data.id) && isUuid(winner.id)) {
      await upsertPaidPayout(admin, {
        orderId: campaignAwardOrderId(slot.data.id, winner.id),
        auctionId: slot.data.id,
        bidId: winner.id,
        chargeAmount: campaignHoldQuote(winner.bidAmount).amount,
        orderName: slot.data.title,
      });
    }

    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '구매 확정하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

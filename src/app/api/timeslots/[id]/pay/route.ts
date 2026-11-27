import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { payTimeslotWithCredit } from '@/lib/timeslot-award';
import { getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
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
      // 결제는 계속합니다.
    }
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('결제하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'advertiser') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('크리에이터 상품 결제는 광고주만 할 수 있습니다.');
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
    if (!slot.data.winnerBidId) {
      return NextResponse.json(
        {
          error: '선정된 신청만 결제할 수 있습니다.',
          errorMessage: '선정된 신청만 결제할 수 있습니다.',
          errorCode: 'NOT_AWARDED',
        },
        { status: 409, headers: NO_STORE },
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
      return forbiddenJson('선정된 광고주만 결제할 수 있습니다.');
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error: '크레딧 원장을 확인하지 못했습니다. 결제는 진행되지 않았습니다.',
          errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
        },
        { status: 503, headers: NO_STORE },
      );
    }
    const paid = await payTimeslotWithCredit(admin, {
      slotId: slot.data.id,
      bidId: winner.id,
      actorUserId: actor.userId,
      actorIsAdmin: hasAuthRole(actor, 'admin'),
    });
    if (!paid.ok) {
      return NextResponse.json(
        {
          error: paid.error,
          errorMessage: paid.error,
          errorCode: paid.errorCode,
          neededAmount: paid.neededAmount,
        },
        { status: paid.status, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { data: paid.data, amount: paid.amount, orderId: paid.orderId },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '결제하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { rethrowPrerenderError } from '@/lib/prerender-error';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { campaignAwardOrderId, releaseCampaignPaymentIfOpen } from '@/lib/campaign-credit';
import { createAdminClient } from '@/lib/supabase/admin';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { closeTimeSlot, listTimeSlotBids, setTimeSlotBlind } from '@/lib/timeslots';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('크리에이터 상품을 변경하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('크리에이터 상품 관리는 관리자만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const slotId = timeslotIdFromParam(id);
    const writer = await timeslotWriter();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    if (typeof body?.isBlind === 'boolean') {
      const result = await setTimeSlotBlind(slotId, body.isBlind, writer);
      if (result.error || !result.data) {
        const message = result.error ?? '숨김 처리를 저장하지 못했습니다.';
        return NextResponse.json(
          { error: message, errorMessage: message },
          { status: 400, headers: NO_STORE },
        );
      }
      return NextResponse.json({ data: result.data }, { headers: NO_STORE });
    }

    if (body?.status === 'closed') {
      const result = await closeTimeSlot(slotId, undefined, writer);
      if (result.error || !result.data) {
        const message = result.error ?? '크리에이터 상품을 마감하지 못했습니다.';
        return NextResponse.json(
          { error: message, errorMessage: message },
          { status: 400, headers: NO_STORE },
        );
      }
      const admin = createAdminClient() ?? writer;
      if (admin) {
        const bids = await listTimeSlotBids(slotId, admin);
        await Promise.all(
          (Array.isArray(bids.data) ? bids.data : []).map((bid) =>
            releaseCampaignPaymentIfOpen(admin, {
              orderId: campaignAwardOrderId(slotId, bid.id),
              auctionId: slotId,
              bidId: bid.id,
              reason: '크리에이터 상품 관리자 강제 마감 미선정 크레딧 복구',
            }),
          ),
        );
      }
      return NextResponse.json({ data: result.data }, { headers: NO_STORE });
    }

    return NextResponse.json(
      { error: '지원하지 않는 변경입니다.', errorMessage: '지원하지 않는 변경입니다.' },
      { status: 400, headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '크리에이터 상품을 변경하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { holdCampaignCredit, releaseCampaignCredit, timeslotAwardReference } from '@/lib/campaign-credit';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { awardTimeSlotBid, getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 낙찰은 계속합니다.
    }
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('낙찰하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('상품 낙찰은 크리에이터만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const slot = await getTimeSlotById(id);
    const ownerId = slot.data?.creatorId;
    if (ownerId && isUuid(ownerId) && ownerId !== actor.userId) {
      return forbiddenJson('본인 상품만 낙찰할 수 있습니다.');
    }
    if (ownerId && actor.userId && ownerId !== actor.userId) {
      return forbiddenJson('본인 상품만 낙찰할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const bidId = asText(body?.bidId);
    let creditReference: string | null = null;
    const admin = createAdminClient();
    if (isUuid(id) && isUuid(bidId)) {
      if (!admin) {
        return NextResponse.json(
          {
            error: '크레딧 원장을 확인하지 못했습니다. 선정은 진행되지 않았습니다.',
            errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
          },
          { status: 503, headers: NO_STORE },
        );
      }
      const bids = await listTimeSlotBids(id);
      const winner = bids.data.find((item) => item.id === bidId);
      const payerId = winner?.advertiserId ?? '';
      if (!winner || winner.bidAmount <= 0 || !isUuid(payerId)) {
        return NextResponse.json(
          {
            error: '광고주 크레딧을 차감할 제안을 찾지 못했습니다.',
            errorCode: 'AWARD_TARGET_NOT_FOUND',
          },
          { status: 400, headers: NO_STORE },
        );
      }
      creditReference = timeslotAwardReference(id, bidId, crypto.randomUUID());
      const held = await holdCampaignCredit(admin, {
        userId: payerId,
        referenceId: creditReference,
        bidAmount: winner.bidAmount,
        title: slot.data?.title ?? '크리에이터 상품',
      });
      if (!held.ok) {
        const status = held.code === 'INSUFFICIENT_CREDIT' ? 402 : 400;
        return NextResponse.json(
          { error: held.message, errorCode: held.code },
          { status, headers: NO_STORE },
        );
      }
    }
    const result = await awardTimeSlotBid(id, bidId, actor.userId);
    if (result.error || !result.data) {
      if (admin && creditReference) {
        await releaseCampaignCredit(admin, {
          referenceId: creditReference,
          reason: '크리에이터 상품 채택 실패로 크레딧 복구',
        });
      }
      const message = result.error ?? '낙찰하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '낙찰하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

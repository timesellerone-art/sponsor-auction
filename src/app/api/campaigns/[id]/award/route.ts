import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { awardCampaignWithCredit } from '@/lib/campaign-award';
import {
  canPreparePayment,
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

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('선정하려면 로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return forbiddenJson('선정은 광고주 계정만 할 수 있습니다.');
    }

    const { id } = await context.params;
    const auctionId = id.trim();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const bidId = asText(body?.bidId);
    if (!isUuid(auctionId) || !isUuid(bidId)) {
      return NextResponse.json(
        { error: '캠페인 또는 제안 ID가 올바르지 않습니다.', errorCode: 'INVALID_AWARD' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          error: '크레딧 원장을 확인하지 못했습니다. 낙찰은 진행되지 않았습니다.',
          errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
        },
        { status: 503, headers: NO_STORE },
      );
    }

    const awarded = await awardCampaignWithCredit(admin, {
      auctionId,
      bidId,
      actorUserId: actor.userId,
      actorIsAdmin: hasAuthRole(actor, 'admin'),
    });
    if (!awarded.ok) {
      return NextResponse.json(
        {
          error: awarded.error,
          errorMessage: awarded.error,
          errorCode: awarded.errorCode,
          neededAmount: awarded.neededAmount,
        },
        { status: awarded.status, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        data: awarded.data,
        amount: awarded.amount,
        orderId: awarded.orderId,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '선정하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorCode: 'AWARD_EXCEPTION' },
      { status: 500, headers: NO_STORE },
    );
  }
}

import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { createCreditChargeOrder, CREDIT_CHARGE_ORDER_NAME, isCreditChargeAmount } from '@/lib/credit-charge';
import { productionTossLiveKeyError } from '@/lib/launch-env';
import { getTossClientKey, getTossSecretKey, isTossClientConfigured } from '@/lib/payments/env';
import { canChargeCredit, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { sanitizeCustomerKey } from '@/lib/payments/intent';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { businessActionBlock } from '@/lib/business-registration';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';


const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 충전 준비는 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('크레딧을 충전하려면 로그인해 주세요.');
    }
    if (!canChargeCredit(actor)) {
      return forbiddenJson('크레딧 충전은 광고주 모드에서 할 수 있습니다.');
    }

    const liveKeyError = productionTossLiveKeyError(process.env, {
      clientKey: getTossClientKey(),
      secretKey: getTossSecretKey(),
    });
    if (liveKeyError) {
      return NextResponse.json(
        {
          error:
            liveKeyError === 'TOSS_TEST_KEY_IN_PRODUCTION'
              ? '운영 환경에는 토스페이먼츠 live_ 키를 등록해야 합니다.'
              : '운영 환경에 토스페이먼츠 라이브 키가 없습니다.',
          errorCode: liveKeyError,
        },
        { status: 503, headers: NO_STORE },
      );
    }

    const limited = consumeRateLimit(clientIp(request), '/api/credits/charge/prepare');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
    const amount = typeof body?.amount === 'number' ? body.amount : Number.NaN;
    if (!isCreditChargeAmount(amount)) {
      return NextResponse.json(
        { error: '충전 금액이 올바르지 않습니다.', errorCode: 'INVALID_AMOUNT' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '충전 주문을 만들지 못했습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const business = await admin
      .from('profiles')
      .select('business_verification_status')
      .eq('id', actor.userId)
      .maybeSingle();
    if (!business.error) {
      const blocked = businessActionBlock(business.data?.business_verification_status, 'charge');
      if (blocked) {
        return NextResponse.json(
          { error: blocked, errorCode: 'BUSINESS_BLOCKED' },
          { status: 403, headers: NO_STORE },
        );
      }
    } else if (!isSchemaMismatch(business.error)) {
      return NextResponse.json(
        { error: '사업자 상태를 확인하지 못했습니다.', errorCode: 'BUSINESS_LOOKUP_FAILED' },
        { status: 503, headers: NO_STORE },
      );
    }

    const created = await createCreditChargeOrder(admin, actor.userId, amount);
    if (!created.ok) {
      return NextResponse.json(
        { error: created.message, errorCode: created.code },
        { status: 400, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        orderId: created.order.orderId,
        amount: created.order.amount,
        orderName: CREDIT_CHARGE_ORDER_NAME,
        customerKey: sanitizeCustomerKey(actor.userId),
        clientKey: getTossClientKey() || null,
        demo: !isTossClientConfigured() && process.env.VERCEL_ENV !== 'production',
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '충전 주문을 만들지 못했습니다.';
    console.error('[SponsorAuction] 크레딧 충전 준비 실패', error);
    return NextResponse.json({ error: message, errorCode: 'PREPARE_FAILED' }, { status: 500, headers: NO_STORE });
  }
}

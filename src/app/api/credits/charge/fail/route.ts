import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { isCreditChargeOrderId, loadCreditChargeOrder, settleCreditCharge } from '@/lib/credit-charge';
import { canPreparePayment, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';


const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 충전 실패 기록은 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return forbiddenJson('크레딧 충전은 광고주 계정만 할 수 있습니다.');
    }

    const limited = consumeRateLimit(clientIp(request), '/api/credits/charge/fail');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    if (!isCreditChargeOrderId(orderId)) {
      return NextResponse.json(
        { error: '충전 주문이 올바르지 않습니다.', errorCode: 'INVALID_ORDER' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '충전 실패를 기록하지 못했습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const order = await loadCreditChargeOrder(admin, orderId);
    if (!order || order.userId !== actor.userId) {
      return NextResponse.json(
        { error: '충전 주문을 찾을 수 없습니다.', errorCode: 'ORDER_NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    const settled = await settleCreditCharge(admin, {
      userId: actor.userId,
      orderId,
      paymentKey: '',
      paidAmount: 0,
      outcome: 'cancelled',
    });
    if (!settled.ok) {
      return NextResponse.json(
        { error: settled.message, errorCode: settled.code, balance: settled.balance },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json(settled, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '충전 실패를 기록하지 못했습니다.';
    console.error('[SponsorAuction] 크레딧 충전 실패 기록 오류', error);
    return NextResponse.json({ error: message, errorCode: 'FAIL_RECORD_FAILED' }, { status: 500, headers: NO_STORE });
  }
}

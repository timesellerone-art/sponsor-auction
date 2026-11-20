import { rethrowPrerenderError } from '@/lib/prerender-error';
import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { getTossClientKey, isTossClientConfigured } from '@/lib/payments/env';
import {
  PAYMENT_INTENT_TTL_MS,
  encodeIntentCookie,
  putIntent,
  sanitizeCustomerKey,
} from '@/lib/payments/intent';
import {
  PAYMENT_VERIFY_COOKIE,
  PAYMENT_VERIFY_CUSTOMER_KEY,
  PAYMENT_VERIFY_ORDER_PREFIX,
  PAYMENT_VERIFY_PRODUCT_NAME,
  isPaymentVerifyAmount,
} from '@/lib/payment-verify';


function jsonError(status: number, errorCode: string, errorMessage: string) {
  return NextResponse.json({ error: errorMessage, errorCode, errorMessage }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
    const amount = Number(body?.amount);
    if (!isPaymentVerifyAmount(amount)) {
      return jsonError(400, 'INVALID_AMOUNT', '결제 금액은 100원 또는 1,000원만 선택할 수 있습니다.');
    }
    if (!isTossClientConfigured()) {
      return jsonError(
        503,
        'TOSS_CLIENT_KEY_MISSING',
        '토스페이먼츠 클라이언트 키가 없어 PG 검수 결제를 시작할 수 없습니다.',
      );
    }

    const intent = {
      orderId: `${PAYMENT_VERIFY_ORDER_PREFIX}${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`,
      auctionId: 'pg-verify',
      bidId: 'pg-verify',
      amount,
      orderName: PAYMENT_VERIFY_PRODUCT_NAME,
      status: 'pending' as const,
      paymentKey: null,
      createdAt: Date.now(),
    };
    putIntent(intent);

    const response = NextResponse.json({
      orderId: intent.orderId,
      amount: intent.amount,
      orderName: intent.orderName,
      customerKey: sanitizeCustomerKey(PAYMENT_VERIFY_CUSTOMER_KEY),
      clientKey: getTossClientKey(),
    });
    response.cookies.set(PAYMENT_VERIFY_COOKIE, encodeIntentCookie(intent), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(PAYMENT_INTENT_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    rethrowPrerenderError(error);
    console.error('[SponsorAuction] PG 검수 결제 준비 실패', error);
    return jsonError(500, 'VERIFY_PREPARE_FAILED', '결제를 준비하지 못했습니다. 다시 시도해 주세요.');
  }
}

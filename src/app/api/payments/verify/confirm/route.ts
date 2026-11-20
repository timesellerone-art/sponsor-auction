import { rethrowPrerenderError } from '@/lib/prerender-error';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getTossSecretKey, isTossSecretConfigured } from '@/lib/payments/env';
import { resolveIntent, updateIntent } from '@/lib/payments/intent';
import { confirmTossPayment } from '@/lib/payments/toss';
import { captureException } from '@/lib/monitoring';
import {
  PAYMENT_VERIFY_COOKIE,
  isPaymentVerifyAmount,
  isPaymentVerifyOrderId,
} from '@/lib/payment-verify';


function jsonError(status: number, errorCode: string, errorMessage: string) {
  return NextResponse.json({ error: `[${errorCode}] ${errorMessage}`, errorCode, errorMessage }, { status });
}

export async function POST(request: Request) {
  try {
    if (!isTossSecretConfigured() || !getTossSecretKey()) {
      return jsonError(503, 'TOSS_SECRET_KEY_MISSING', '토스페이먼츠 시크릿 키가 없어 결제를 승인할 수 없습니다.');
    }

    const body = (await request.json().catch(() => null)) as {
      paymentKey?: unknown;
      orderId?: unknown;
      amount?: unknown;
    } | null;
    const paymentKey = typeof body?.paymentKey === 'string' ? body.paymentKey.trim() : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const amount = Number(body?.amount);
    if (!paymentKey || !isPaymentVerifyOrderId(orderId) || !isPaymentVerifyAmount(amount)) {
      return jsonError(400, 'INVALID_CONFIRM_BODY', 'PG 검수 결제 정보가 올바르지 않습니다.');
    }

    const cookieStore = await cookies();
    const intent = resolveIntent(orderId, cookieStore.get(PAYMENT_VERIFY_COOKIE)?.value);
    if (!intent || intent.orderId !== orderId) {
      return jsonError(409, 'INTENT_NOT_FOUND', '결제 요청이 만료되었거나 찾을 수 없습니다.');
    }
    if (intent.status === 'confirmed') {
      return NextResponse.json({
        orderId,
        amount: intent.amount,
        paymentKey: intent.paymentKey ?? paymentKey,
        alreadyConfirmed: true,
      });
    }
    if (intent.amount !== amount) {
      updateIntent(orderId, { status: 'failed' });
      return jsonError(400, 'AMOUNT_MISMATCH', '결제 금액이 주문 정보와 일치하지 않습니다.');
    }

    const toss = await confirmTossPayment({ paymentKey, orderId, amount });
    if (!toss.ok) {
      updateIntent(orderId, { status: 'failed', paymentKey });
      captureException(new Error(toss.errorMessage || toss.error), {
        area: 'payment_verify_confirm',
        errorCode: toss.errorCode,
        orderId,
      });
      return jsonError(
        402,
        toss.errorCode || 'TOSS_CONFIRM_FAILED',
        toss.errorMessage || '결제 승인에 실패했습니다.',
      );
    }

    updateIntent(orderId, { status: 'confirmed', paymentKey });
    return NextResponse.json({
      orderId,
      amount,
      paymentKey,
      alreadyConfirmed: Boolean(toss.alreadyConfirmed),
    });
  } catch (error) {
    rethrowPrerenderError(error);
    captureException(error, { area: 'payment_verify_confirm' });
    return jsonError(500, 'CONFIRM_EXCEPTION', '결제 승인 중 오류가 발생했습니다.');
  }
}

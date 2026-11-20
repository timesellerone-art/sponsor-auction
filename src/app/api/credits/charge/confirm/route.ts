import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  demoCreditPaymentKey,
  isCreditChargeOrderId,
  loadCreditChargeOrder,
  settleCreditCharge,
} from '@/lib/credit-charge';
import { getTossClientKey, getTossSecretKey, isTossSecretConfigured } from '@/lib/payments/env';
import { canChargeCredit, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { confirmTossPayment, fetchTossPayment } from '@/lib/payments/toss';
import { mapTossPaymentStatus } from '@/lib/payments/toss-webhook';
import { productionTossLiveKeyError } from '@/lib/launch-env';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';


const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

function jsonError(status: number, errorCode: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, errorCode, ...extra }, { status, headers: NO_STORE });
}

function demoCreditConfirmAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 충전 승인은 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('크레딧 충전을 승인하려면 로그인해 주세요.');
    }
    if (!canChargeCredit(actor)) {
      return forbiddenJson('크레딧 충전은 광고주 모드에서 할 수 있습니다.');
    }

    const liveKeyError = productionTossLiveKeyError(process.env, {
      clientKey: getTossClientKey(),
      secretKey: getTossSecretKey(),
    });
    if (liveKeyError) {
      return jsonError(503, liveKeyError, '운영 환경의 토스페이먼츠 라이브 키를 확인해 주세요.');
    }

    const limited = consumeRateLimit(clientIp(request), '/api/credits/charge/confirm');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const body = (await request.json().catch(() => null)) as {
      orderId?: unknown;
      paymentKey?: unknown;
      amount?: unknown;
    } | null;
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
    const paymentKey = typeof body?.paymentKey === 'string' ? body.paymentKey.trim() : '';
    const claimedAmount = typeof body?.amount === 'number' ? body.amount : Number.NaN;
    if (!isCreditChargeOrderId(orderId) || !paymentKey || !Number.isInteger(claimedAmount)) {
      return jsonError(400, 'INVALID_CONFIRM', '충전 승인 정보가 올바르지 않습니다.');
    }

    const admin = createAdminClient();
    if (!admin) {
      return jsonError(503, 'ADMIN_UNAVAILABLE', '크레딧 충전을 처리하지 못했습니다.');
    }

    const order = await loadCreditChargeOrder(admin, orderId);
    if (!order || order.userId !== actor.userId) {
      return jsonError(404, 'ORDER_NOT_FOUND', '충전 주문을 찾을 수 없습니다.');
    }
    if (claimedAmount !== order.amount) {
      const settled = await settleCreditCharge(admin, {
        userId: actor.userId,
        orderId,
        paymentKey,
        paidAmount: claimedAmount,
        outcome: 'confirmed',
      });
      return jsonError(400, 'AMOUNT_MISMATCH', '결제 금액이 충전 주문과 다릅니다.', {
        balance: settled.ok ? settled.balance : settled.balance,
      });
    }

    if (isTossSecretConfigured()) {
      const confirmed = await confirmTossPayment({
        paymentKey,
        orderId,
        amount: order.amount,
      });
      if (!confirmed.ok) {
        return jsonError(
          confirmed.httpStatus && confirmed.httpStatus >= 400 ? confirmed.httpStatus : 402,
          confirmed.errorCode || 'TOSS_CONFIRM_FAILED',
          confirmed.errorMessage || '토스페이먼츠 승인에 실패했습니다.',
        );
      }

      const lookedUp = await fetchTossPayment(paymentKey);
      if (!lookedUp.ok) {
        return jsonError(502, lookedUp.errorCode, '승인된 결제를 확인하지 못했습니다.');
      }
      const payment = lookedUp.payment;
      if (payment.orderId !== order.orderId || payment.paymentKey !== paymentKey) {
        return jsonError(400, 'PAYMENT_KEY_MISMATCH', '결제 식별자가 충전 주문과 다릅니다.');
      }
      if (payment.totalAmount !== order.amount) {
        return jsonError(400, 'AMOUNT_MISMATCH', '토스페이먼츠 결제 금액이 충전 주문과 다릅니다.');
      }

      const mapped = mapTossPaymentStatus(payment.status);
      if (mapped !== 'confirmed' && mapped !== 'failed' && mapped !== 'expired') {
        return jsonError(409, 'PAYMENT_NOT_CONFIRMED', '아직 완료되지 않은 결제입니다.');
      }

      const settled = await settleCreditCharge(admin, {
        userId: actor.userId,
        orderId,
        paymentKey: payment.paymentKey,
        paidAmount: payment.totalAmount,
        outcome: mapped === 'confirmed' ? 'confirmed' : 'failed',
      });
      if (!settled.ok) {
        return jsonError(400, settled.code, settled.message, { balance: settled.balance });
      }
      return NextResponse.json(settled, { headers: NO_STORE });
    }

    if (demoCreditConfirmAllowed() && paymentKey === demoCreditPaymentKey(orderId)) {
      const settled = await settleCreditCharge(admin, {
        userId: actor.userId,
        orderId,
        paymentKey,
        paidAmount: order.amount,
        outcome: 'confirmed',
      });
      if (!settled.ok) {
        return jsonError(400, settled.code, settled.message, { balance: settled.balance });
      }
      return NextResponse.json(settled, { headers: NO_STORE });
    }

    return jsonError(503, 'TOSS_SECRET_KEY_MISSING', '토스페이먼츠 비밀키가 없어 충전을 승인하지 못했습니다.');
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '크레딧 충전에 실패했습니다.';
    console.error('[SponsorAuction] 크레딧 충전 승인 실패', error);
    return jsonError(500, 'CONFIRM_FAILED', message);
  }
}

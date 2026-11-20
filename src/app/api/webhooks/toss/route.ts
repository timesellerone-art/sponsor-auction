import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { isCreditChargeOrderId, loadCreditChargeOrder, settleCreditCharge } from '@/lib/credit-charge';
import { captureException } from '@/lib/monitoring';
import { productionTossLiveKeyError } from '@/lib/launch-env';
import { getTossClientKey, getTossSecretKey, isTossSecretConfigured } from '@/lib/payments/env';
import { holdCampaignPayment, releaseCampaignPaymentIfOpen } from '@/lib/campaign-credit';
import { finalizeConfirmedPayment } from '@/lib/payments/finalize';
import { getIntent, putIntent } from '@/lib/payments/intent';
import { loadPaymentByOrderId, persistPayment } from '@/lib/payments/persist';
import {
  confirmTossPayment,
  fetchTossPayment,
  fetchTossPaymentByOrderId,
  type TossPaymentSnapshot,
} from '@/lib/payments/toss';
import {
  mapTossPaymentStatus,
  parseTossWebhookBody,
  verifyTossWebhookSignature,
} from '@/lib/payments/toss-webhook';
import { paymentDbConfigForRequest } from '@/lib/supabase/payment-config';
import { createAdminClient } from '@/lib/supabase/admin';


const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function storedIntentFromPayment(
  payment: TossPaymentSnapshot,
  stored: {
    auctionId: string;
    bidId: string;
    amount: number;
    orderName: string;
    status: string;
    paymentKey: string | null;
  },
) {
  return {
    orderId: payment.orderId,
    auctionId: stored.auctionId,
    bidId: stored.bidId,
    amount: stored.amount,
    orderName: stored.orderName,
    status: stored.status as 'pending' | 'confirmed' | 'failed' | 'expired',
    paymentKey: stored.paymentKey,
    createdAt: Date.now(),
  };
}

async function handleCreditChargeWebhook(event: { kind: 'payment' | 'deposit'; orderId: string; paymentKey?: string }) {
  const admin = createAdminClient();
  if (!admin) {
    return json(503, {
      error: 'ADMIN_UNAVAILABLE',
      errorCode: 'ADMIN_UNAVAILABLE',
      errorMessage: '크레딧 충전 주문을 확인하지 못했습니다.',
    });
  }

  const lookedUp = await lookupVerifiedPayment({
    paymentKey: event.paymentKey,
    orderId: event.orderId,
  });
  if (!lookedUp.ok) {
    if (lookedUp.httpStatus === 404 || lookedUp.errorCode === 'NOT_FOUND_PAYMENT') {
      return json(200, { ok: true, ignored: true, reason: 'payment_not_found' });
    }
    return json(500, {
      error: lookedUp.errorCode,
      errorCode: lookedUp.errorCode,
      errorMessage: '토스페이먼츠 결제 조회에 실패했습니다. 재전송을 기다립니다.',
    });
  }

  const payment = lookedUp.payment;
  if (payment.orderId !== event.orderId || !isCreditChargeOrderId(payment.orderId)) {
    return json(400, {
      error: 'ORDER_ID_MISMATCH',
      errorCode: 'ORDER_ID_MISMATCH',
      errorMessage: '웹훅 주문번호가 크레딧 충전 주문과 다릅니다.',
    });
  }

  const order = await loadCreditChargeOrder(admin, payment.orderId);
  if (!order) {
    return json(200, { ok: true, ignored: true, reason: 'credit_order_not_found' });
  }

  const mapped = mapTossPaymentStatus(payment.status);
  if (mapped === 'ignored') {
    return json(200, { ok: true, ignored: true, orderId: payment.orderId, tossStatus: payment.status });
  }
  if (mapped === 'confirmed' && payment.totalAmount !== order.amount) {
    console.error('[SponsorAuction] 크레딧 충전 웹훅 금액 불일치', {
      orderId: payment.orderId,
      storedAmount: order.amount,
      tossAmount: payment.totalAmount,
    });
    return json(400, {
      error: 'AMOUNT_MISMATCH',
      errorCode: 'AMOUNT_MISMATCH',
      errorMessage: '웹훅 금액이 크레딧 충전 주문과 다릅니다.',
    });
  }

  const settled = await settleCreditCharge(admin, {
    userId: order.userId,
    orderId: order.orderId,
    paymentKey: payment.paymentKey,
    paidAmount: mapped === 'confirmed' ? payment.totalAmount : 0,
    outcome: mapped === 'confirmed' ? 'confirmed' : 'failed',
  });
  if (!settled.ok) {
    return json(400, {
      error: settled.code,
      errorCode: settled.code,
      errorMessage: settled.message,
      balance: settled.balance,
    });
  }

  console.info('[SponsorAuction] 크레딧 충전 웹훅 반영', {
    orderId: order.orderId,
    code: settled.code,
    charged: settled.charged,
    duplicate: settled.duplicate,
    balance: settled.balance,
  });
  return json(200, {
    ok: true,
    orderId: order.orderId,
    code: settled.code,
    charged: settled.charged,
    duplicate: settled.duplicate,
    balance: settled.balance,
  });
}

async function lookupVerifiedPayment(input: {
  paymentKey?: string;
  orderId: string;
}): Promise<
  | { ok: true; payment: TossPaymentSnapshot }
  | { ok: false; errorCode: string; httpStatus?: number }
> {
  if (input.paymentKey) {
    const byKey = await fetchTossPayment(input.paymentKey);
    if (byKey.ok) {
      return byKey;
    }
  }
  return fetchTossPaymentByOrderId(input.orderId);
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 웹훅은 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const liveKeyError = productionTossLiveKeyError(process.env, {
      clientKey: getTossClientKey(),
      secretKey: getTossSecretKey(),
    });
    if (liveKeyError) {
      console.error('[SponsorAuction] Toss 웹훅 중단: 운영 라이브 키 아님', { liveKeyError });
      return json(503, {
        error: liveKeyError,
        errorCode: liveKeyError,
        errorMessage: '운영 환경의 토스페이먼츠 라이브 키를 확인하세요.',
      });
    }

    if (!isTossSecretConfigured()) {
      return json(503, {
        error: 'TOSS_SECRET_KEY_MISSING',
        errorCode: 'TOSS_SECRET_KEY_MISSING',
        errorMessage: 'TOSS_SECRET_KEY가 없어 웹훅을 검증할 수 없습니다.',
      });
    }

    const rawBody = await request.text();
    const signature = verifyTossWebhookSignature(rawBody, request.headers);
    if (!signature.ok) {
      console.error('[SponsorAuction] Toss 웹훅 서명 검증 실패');
      return json(401, {
        error: 'TOSS_WEBHOOK_INVALID',
        errorCode: 'TOSS_WEBHOOK_INVALID',
        errorMessage: '토스페이먼츠 웹훅 서명이 올바르지 않습니다.',
      });
    }

    let parsedJson: unknown = null;
    try {
      parsedJson = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return json(400, {
        error: 'INVALID_WEBHOOK_BODY',
        errorCode: 'INVALID_WEBHOOK_BODY',
        errorMessage: '웹훅 본문이 JSON이 아닙니다.',
      });
    }

    const event = parseTossWebhookBody(parsedJson);
    if (!event) {
      return json(400, {
        error: 'INVALID_WEBHOOK_BODY',
        errorCode: 'INVALID_WEBHOOK_BODY',
        errorMessage: '지원하지 않는 웹훅 본문입니다.',
      });
    }

    if (event.kind === 'ignored') {
      return json(200, { ok: true, ignored: true, eventType: event.eventType });
    }

    if (isCreditChargeOrderId(event.orderId)) {
      return handleCreditChargeWebhook(event);
    }

    const lookedUp = await lookupVerifiedPayment({
      paymentKey: event.kind === 'payment' ? event.paymentKey : undefined,
      orderId: event.orderId,
    });
    if (!lookedUp.ok) {
      console.error('[SponsorAuction] Toss 웹훅 결제 조회 실패', {
        orderId: event.orderId,
        errorCode: lookedUp.errorCode,
        httpStatus: lookedUp.httpStatus,
      });
      if (lookedUp.httpStatus === 404 || lookedUp.errorCode === 'NOT_FOUND_PAYMENT') {
        return json(200, {
          ok: true,
          ignored: true,
          reason: 'payment_not_found',
        });
      }
      return json(500, {
        error: lookedUp.errorCode,
        errorCode: lookedUp.errorCode,
        errorMessage: '토스페이먼츠 결제 조회에 실패했습니다. 재전송을 기다립니다.',
      });
    }

    const payment = lookedUp.payment;
    if (payment.orderId !== event.orderId) {
      console.error('[SponsorAuction] Toss 웹훅 orderId 불일치', {
        webhookOrderId: event.orderId,
        tossOrderId: payment.orderId,
      });
      return json(400, {
        error: 'ORDER_ID_MISMATCH',
        errorCode: 'ORDER_ID_MISMATCH',
        errorMessage: '웹훅 주문번호가 결제 조회 결과와 다릅니다.',
      });
    }

    const dbConfig = await paymentDbConfigForRequest();
    const stored = await loadPaymentByOrderId(payment.orderId, dbConfig);
    const memory = getIntent(payment.orderId);
    const source = stored
      ? storedIntentFromPayment(payment, stored)
      : memory && memory.orderId === payment.orderId
        ? memory
        : null;

    if (!source) {
      console.info('[SponsorAuction] Toss 웹훅: 로컬 주문 없음, 무시', {
        orderId: payment.orderId,
        tossStatus: payment.status,
      });
      return json(200, { ok: true, ignored: true, reason: 'order_not_found' });
    }

    if (source.amount !== payment.totalAmount) {
      console.error('[SponsorAuction] Toss 웹훅 금액 불일치', {
        orderId: payment.orderId,
        storedAmount: source.amount,
        tossAmount: payment.totalAmount,
      });
      return json(400, {
        error: 'AMOUNT_MISMATCH',
        errorCode: 'AMOUNT_MISMATCH',
        errorMessage: '웹훅 금액이 주문 금액과 다릅니다.',
      });
    }

    putIntent({
      ...source,
      paymentKey: payment.paymentKey,
    });

    if (source.status === 'confirmed') {
      return json(200, {
        ok: true,
        alreadyConfirmed: true,
        orderId: payment.orderId,
        status: payment.status,
      });
    }

    const mapped = mapTossPaymentStatus(payment.status);
    if (mapped === 'confirmed') {
      const admin = createAdminClient();
      if (!admin) {
        return json(503, {
          error: 'CREDIT_LEDGER_UNAVAILABLE',
          errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
          errorMessage: '크레딧 원장을 확인하지 못했습니다.',
        });
      }
      const held = await holdCampaignPayment(admin, {
        orderId: source.orderId,
        auctionId: source.auctionId,
        bidId: source.bidId,
      });
      if (!held.ok) {
        console.error('[SponsorAuction] Toss 웹훅 크레딧 차감 실패', {
          orderId: source.orderId,
          code: held.code,
        });
        if (held.code === 'INSUFFICIENT_CREDIT' || held.code === 'ALREADY_AWARDED' || held.code === 'FORBIDDEN') {
          return json(200, {
            ok: false,
            awarded: false,
            orderId: payment.orderId,
            errorCode: held.code,
            errorMessage: held.message,
          });
        }
        return json(500, {
          error: held.code,
          errorCode: held.code,
          errorMessage: held.message,
        });
      }
      const finalized = await finalizeConfirmedPayment(source, payment.paymentKey, dbConfig);
        if (!finalized.ok) {
          captureException(new Error(finalized.errorMessage), {
            area: 'toss_webhook',
            errorCode: finalized.errorCode,
            orderId: payment.orderId,
          });
          await releaseCampaignPaymentIfOpen(admin, {
            orderId: source.orderId,
            auctionId: source.auctionId,
            bidId: source.bidId,
            reason: '웹훅 채택 실패로 크레딧 복구',
          });
          return json(500, {
            error: finalized.errorCode,
            errorCode: finalized.errorCode,
            errorMessage: finalized.errorMessage,
          });
        }
      console.info('[SponsorAuction] Toss 웹훅 결제 확정', {
        orderId: payment.orderId,
        tossStatus: payment.status,
        saved: finalized.saved,
      });
      return json(200, {
        ok: true,
        orderId: payment.orderId,
        status: 'confirmed',
        saved: finalized.saved,
      });
    }

    if (mapped === 'ignored') {
      const confirmable = /^(READY|IN_PROGRESS)$/i.test(payment.status);
      if (confirmable && source.status === 'pending') {
        const retryAdmin = createAdminClient();
        if (!retryAdmin) {
          return json(503, {
            error: 'CREDIT_LEDGER_UNAVAILABLE',
            errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
            errorMessage: '크레딧 원장을 확인하지 못했습니다.',
          });
        }
        const retryHeld = await holdCampaignPayment(retryAdmin, {
          orderId: source.orderId,
          auctionId: source.auctionId,
          bidId: source.bidId,
        });
        if (!retryHeld.ok) {
          if (
            retryHeld.code === 'INSUFFICIENT_CREDIT' ||
            retryHeld.code === 'ALREADY_AWARDED' ||
            retryHeld.code === 'FORBIDDEN'
          ) {
            return json(200, {
              ok: false,
              awarded: false,
              orderId: payment.orderId,
              errorCode: retryHeld.code,
              errorMessage: retryHeld.message,
            });
          }
          return json(500, {
            error: retryHeld.code,
            errorCode: retryHeld.code,
            errorMessage: retryHeld.message,
          });
        }
        const confirmed = await confirmTossPayment({
          paymentKey: payment.paymentKey,
          orderId: payment.orderId,
          amount: source.amount,
        });
        if (!confirmed.ok) {
          console.error('[SponsorAuction] Toss 웹훅 자동 승인 실패', {
            orderId: payment.orderId,
            errorCode: confirmed.errorCode,
          });
          await releaseCampaignPaymentIfOpen(retryAdmin, {
            orderId: source.orderId,
            auctionId: source.auctionId,
            bidId: source.bidId,
            reason: '웹훅 자동 승인 실패로 크레딧 복구',
          });
          return json(500, {
            error: confirmed.errorCode || 'TOSS_CONFIRM_FAILED',
            errorCode: confirmed.errorCode || 'TOSS_CONFIRM_FAILED',
            errorMessage: confirmed.errorMessage || '웹훅에서 결제 승인을 완료하지 못했습니다.',
          });
        }
        const finalized = await finalizeConfirmedPayment(source, payment.paymentKey, dbConfig);
        if (!finalized.ok) {
          await releaseCampaignPaymentIfOpen(retryAdmin, {
            orderId: source.orderId,
            auctionId: source.auctionId,
            bidId: source.bidId,
            reason: '웹훅 재승인 채택 실패로 크레딧 복구',
          });
          return json(500, {
            error: finalized.errorCode,
            errorCode: finalized.errorCode,
            errorMessage: finalized.errorMessage,
          });
        }
        return json(200, {
          ok: true,
          orderId: payment.orderId,
          status: 'confirmed',
          confirmedFromWebhook: true,
        });
      }

      return json(200, {
        ok: true,
        ignored: true,
        orderId: payment.orderId,
        tossStatus: payment.status,
      });
    }

    if (mapped === 'failed' || mapped === 'expired') {
      await persistPayment(source, mapped, payment.paymentKey, dbConfig);
      const admin = createAdminClient();
      if (admin) {
        await releaseCampaignPaymentIfOpen(admin, {
          orderId: source.orderId,
          auctionId: source.auctionId,
          bidId: source.bidId,
          reason: '결제 실패로 캠페인 크레딧 복구',
        });
      }
      console.info('[SponsorAuction] Toss 웹훅 결제 종료', {
        orderId: payment.orderId,
        status: mapped,
        tossStatus: payment.status,
      });
      return json(200, { ok: true, orderId: payment.orderId, status: mapped });
    }

    return json(200, { ok: true, ignored: true, orderId: payment.orderId });
  } catch (error) {
    rethrowPrerenderError(error);
    captureException(error, { area: 'toss_webhook' });
    const message = error instanceof Error ? error.message : '웹훅을 처리하지 못했습니다.';
    console.error('[SponsorAuction] Toss 웹훅 예외', error);
    return json(500, {
      error: 'WEBHOOK_EXCEPTION',
      errorCode: 'WEBHOOK_EXCEPTION',
      errorMessage: message,
    });
  }
}
